'use strict';

module.exports = (function() {
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
	 * Loads a flattened (and conpacted) JSON-LD document into the µRDF store.
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
	 * Runs a JSON-LD frame object with nesting,
	 * interpreted as a query, against the µRDF store
	 * (blank nodes = variables). The input frame can
	 * contain the @reverse keyword but the input frame
	 * must be a single object.
	 *
	 * Returns mappings as defined by the SPARQL results
	 * JSON format.
	 * See https://www.w3.org/TR/sparql11-results-json/.
	 */
	urdf.query = function(obj) {
		var _queryAll = function(q, list, bindings) {
			return list.map(function(o) {
				o = urdf.find(o['@id']);

				if (o === null) {
					return null;
				} else {
					return _query(q, o, bindings);
				}
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

		var _query = function(q, s, bindings) {
			if (!urdf.match(q, s)) {
				return null;
			} else {
				if (urdf.isVariable(q)) {
					let cur = {
						[urdf.lexicalForm(q)]: {
							'type': 'uri',
							'value': s['@id']
						}
					};

					if (bindings.length === 0) {
						bindings = [cur];
					} else {
						bindings = bindings.map(function(b) {
							return urdf.merge(cur, b);
						}).filter(function(b) {
							return b !== null;
						});
					}
				}

				return urdf.signature(q).reduce(function(b, p) {
					if (b === null) {
						return b;
					} else {
						// TODO take 'require all' flag into account (default: true)
						if (p === '@id' || s[p] === undefined) {
							return b;
						} else {
							return q[p].reduce(function(b2, o) {
								if (b2 === null) {
									return b2;
								} else {
									// TODO process @reverse
									var l = s[p];
		
									if (p === '@type') {
										o = { '@id': o };
										l = l.map(function(t) {
											return { '@id': t };
										});
									}
		
									return _queryAll(o, l, b2);
								}
							}, b);
						}
					}
				}, bindings);
			}
		};
		
		// TODO optimize query plan (query rewriting)		
		var init = urdf.isVariable(obj) ? urdf.store : [{
			'@id': obj['@id']
		}];

		return _queryAll(obj, init, []);
	};

	/**
	 * Compares the two input objects in terms of identifiers
	 * and signatures (list of properties). The last parameter
	 * is a 'require all' flag, specifying whether all of the
	 * properties of n should match those of q (all = true) or
	 * at least one (all = false). If not provided, all = true.
	 * 
	 * Returns true if the identifier and the signature of n
	 * matches q, false otherwise.
	 * 
	 * TODO include type signature?
	 */
	urdf.match = function(q, n, all) {
		if (urdf.isLiteral(q)) {
			// TODO pattern matching
		} else {
			if (!urdf.isVariable(q) && q['@id'] !== n['@id']) {
				return false;
			}
	
			var s = urdf.signature(q);
			var _includes = function(p) {
				return p === '@id' || n[p] !== undefined;
			};
	
			if (all === undefined) {
				all = true;
			}
	
			return all ? s.every(_includes) : s.some(_includes);
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
	 * Returns the signature of the input node (the list of its properties).
	 * 
	 * TODO bitmap as in the original impl?
	 */
	urdf.signature = function(obj) {
		return Object.keys(obj);
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