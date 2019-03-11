'use strict';

(function() {
	/**
	 * Namespace declaration.
	 */
	var urdf = {};
	
	/**
	 * A JSON-LD context URI providing mappings
	 * from JSON keys to RDF IRIs.
	 */
	urdf.context = '';

	/**
	 * The µRDF store data structure.
	 * 
	 * TODO make private (in closure only)
	 */
	urdf.store = [];

	/**
	 * Returns the number of triples stored in the µRDF store.
	 */
	urdf.size = function() {
		var size = 0;
		
		urdf.store.forEach(function(n) {
			for (var p in n) {
				if (p !== '@id') {
					size += n[p].length;
				}
			}
		});
		
		return size;
	};

	/**
	 * Loads a flattened (and compacted) JSON-LD document into the µRDF store.
	 * 
	 * Returns true if no error occurred, false otherwise.
	 */
	urdf.load = function(json) {
		json.forEach(function(n) {
			var s = urdf.find(n['@id']);
			
			if (s === null) {
				// TODO copy instead
				urdf.store.push(n);
			} else {
				for (var p in n) {
					s[p] = n[p];
				}
			}
		});
		
		// TODO include object nodes in the store array
		
		return true;
	};

	/**
	 * Empties the content of the µRDF store.
	 * 
	 * Returns true.
	 */
	urdf.clear = function() {
		urdf.store = [];

		return true;
	};

	/**
	 * Looks for the first node in the µRDF store with the given input.
	 * 
	 * Returns the node if found, null otherwise.
	 */
	urdf.find = function(id) {
		var node = urdf.store.find(function(n) {
			return id === n['@id'];
		});
		
		return node === undefined ? null : node;
	};

	/**
	 * Processes a flattened JSON-LD frame object,
	 * interpreted as a query, against the µRDF store
	 * (blank nodes = variables).
	 *
	 * Returns mappings as defined by the SPARQL results
	 * JSON format.
	 * See https://www.w3.org/TR/sparql11-results-json/.
	 */
	urdf.query = function(frame) {
		var _queryAll = function(f, list, bindings) {
			return list.map(function(n) {
				return _query(f, n, bindings);
			}).reduce(function(disjunction, b) {
				if (b === null) {
					return disjunction;
				} else {
					if (disjunction === null) {
						return b;
					} else {
						return disjunction.concat(b);
					}
				}
			}, null);
		};

		var _query = function(f, s, bindings) {
			if (!urdf.match(f, s)) {
				return null;
			} else {
				if (urdf.isVariable(f)) {
					bindings = _merge(bindings, [{
						// TODO exclude from result if no bnode label
						[urdf.lexicalForm(f)]: {
							'type': 'uri',
							'value': s['@id']
						}
					}]);
				}

				if (f['@type'] !== undefined) {
					let types = s['@type'].map(function(t) {
						return { '@id': t };
					});

					let tb = f['@type'].filter(function(t) {
						return urdf.isVariable({ '@id': t })
					}).reduce(function(b, t) {
						return _queryAll({ '@id': t }, types, b);
					}, []);

					bindings = _merge(bindings, tb);
				}

				return urdf.signature(f).reduce(function(b, p) {
					if (b === null) {
						return b;
					} else {
						// TODO take 'require all' flag into account (default: true)
						if (s[p] === undefined) {
							return b;
						} else {
							return f[p].reduce(function(b2, f2) {
								if (b2 === null) {
									return b2;
								} else {
									return _queryAll(f2, s[p], b2);
								}
							}, b);
						}
					}
				}, bindings);
			}
		};

		var _merge = function(bs1, bs2) {
			if (bs1.length === 0) {
				return bs2;
			} else if (bs2.length === 0) {
				return bs1;
			} else {
				return bs1.reduce(function(dis1, b1) {
					return bs2.reduce(function(dis2, b2) {
						var b = urdf.merge(b1, b2);

						// TODO duplicated code with _queryAll()
						if (b !== null) {
							if (dis2 === null) {
								dis2 = [b];
							} else {
								dis2.push(b);
							}
						}

						return dis2;
					}, dis1);
				}, null);
			}
		};

		// TODO optimize query plan (query rewriting)

		return frame.reduce(function(bindings, f) {
			if (bindings === null) {
				return bindings;
			}

			var nodes = [];

			if (urdf.isVariable(f)) {
				var name = urdf.lexicalForm(f);

				nodes = bindings.reduce(function(uris, b) {
					if (b[name] != undefined) {
						var t = b[name].type;
						var v = b[name].value;

						if (t === 'uri' && uris.indexOf(v) == -1) {
							uris.push(v);
						}
					};

					return uris;
				}, []).map(function(uri) {
					return urdf.find(uri);
				});

				if (nodes.length === 0) {
					nodes = urdf.store;
				}
			} else {
				var n = urdf.find(f['@id']);
				if (n === null) {
					return null;
				} else {
					nodes.push(n);
				}
			}

			return _queryAll(f, nodes, bindings);
		}, []);
	};

	/**
	 * Compares the two input objects in terms of identifiers
	 * and signatures (list of types and list of properties).
	 * The last parameter is a 'require all' flag, specifying
	 * whether all of the properties of n should match those of
	 * q (all = true) or at least one (all = false). If not
	 * provided, all = true. For type signatures, 'require
	 * all' is always false.
	 * 
	 * Returns true if the identifier and the signatures of n
	 * matches q (types and properties), false otherwise.
	 */
	urdf.match = function(q, n, all) {
		if (urdf.isLiteral(q)) {
			// TODO pattern matching
		} else {
			if (!urdf.isVariable(q) && q['@id'] !== n['@id']) {
				return false;
			}

			var _intersects = function(a, b) {
				if (a === undefined) {
					return true;
				} else if (b === undefined && a.length > 0) {
					return false;
				} else {
					return a.some(function(elem) {
						return urdf.isVariable({ '@id': elem }) || b.indexOf(elem) > -1;
					});
				}
			};

			if (!_intersects(q['@type'], n['@type'])) {
				return false;
			}

			var _isSubset = function(a, b) {
				if (a === undefined) {
					return true;
				} else if (b === undefined && a.length > 0) {
					return false;
				} else {
					return a.every(function(elem) {
						return urdf.isVariable({ '@id': elem }) || b.indexOf(elem) > -1;
					});
				}
			};

			let sq = urdf.signature(q);
			let sn = urdf.signature(n);

			return all === false ? _interects(sq, sn) : _isSubset(sq, sn);
		}
	};

	/**
	 * Merges two bindings.
	 *
	 * Returns a new binding object with entries of both input objects
	 * if bindings are compatible, null otherwise.
	 */
	urdf.merge = function(b1, b2) {
		var b = {};
		
		for (var v in b1) {
			if (b2[v] !== undefined && b2[v].value !== b1[v].value) {
				return null;
			}

			b[v] = b1[v];
		}

		for (var v in b2) {
			if (b[v] === undefined) {
				b[v] = b2[v];
			}
		}
		
		return b;
	};

	/**
	 * Returns the signature of the input node
	 * (the list of its properties, excluding @id, @type).
	 * 
	 * TODO bitmap as in the original impl?
	 */
	urdf.signature = function(obj) {
		return Object.keys(obj).filter(p => p !== '@id' && p !== '@type');
	}

	/**
	 * Evaluates if the input object is a variable
	 * (i.e. a blank node).
	 *
	 * Returns true if obj is a variable, false otherwise.
	 */
	urdf.isVariable = function(obj) {
		return obj['@id'] !== null && obj['@id'].indexOf('_:') === 0;
	};

	/**
	 * Evaluates if the input object is a literal.
	 *
	 * Returns true if obj is a literal, false otherwise.
	 */
	urdf.isLiteral = function(obj) {
		return obj['@value'] !== undefined;
	};

	/**
	 * Returns the RDF lexical form of the input object.
	 */
	urdf.lexicalForm = function(obj) {
		if (urdf.isVariable(obj)) return obj['@id'].substring(2);
		else if (urdf.isLiteral(obj)) return obj['@value'];
		else return obj['@id'] ? obj['@id'] : '';
	}
	
	return urdf;
})();