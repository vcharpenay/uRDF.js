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
	 */
	var store = [
		{
			// default graph
			'@graph': []
		}
	];

	/**
	 * Returns the number of triples stored in the µRDF store
	 * or in the given named graph.
	 */
	urdf.size = function(gid) {
		var size = 0;
		
		store.forEach(function(g) {
			if (gid !== undefined && g['@id'] !== gid) return;

			g['@graph'].forEach(function(n) {
				for (var p in n) {
					if (p !== '@id') size += n[p].length;
				}
			});
		});
		
		return size;
	};

	/**
	 * Loads a flattened (and compacted) JSON-LD document into the µRDF store.
	 * 
	 * Returns true if no error occurred, false otherwise.
	 */
	urdf.load = function(json, gid) {
		json.forEach(function(n) {
			var s = urdf.find(n['@id'], gid);
			
			if (s === null) {
				// TODO copy instead
				var g = urdf.findGraph(gid);

				if (g === null) {
					g = [];

					var container = { '@graph': g };
					if (gid !== undefined) container['@id'] = gid;

					store.push(container);
				}

				g.push(n);
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
	 * Empties the content of the µRDF store or of a named graph, if provided.
	 * 
	 * Returns true.
	 */
	urdf.clear = function(gid) {
		store = store.filter(function(g) {
			return gid !== undefined && g['@id'] !== gid;
		});

		store.push({
			// default graph
			'@graph': []
		});

		return true;
	};

	/**
	 * Lists all named graph in the µRDF store.
	 * 
	 * Returns a (possibly empty) list of graph identifiers.
	 */
	urdf.listGraphs = function() {
		return store.map(function(g) {
			return g['@id'];
		}).filter(function(name) {
			return name !== undefined
		});
	};

	/**
	 * Looks for a named graph with the given identifier in the µRDF store
	 * or the default graph if no identifier is provided.
	 * 
	 * Returns the graph's node list if found, the default graph otherwise.
	 */
	urdf.findGraph = function(gid) {
		var graph = store.find(function(g) {
			return gid !== undefined && g['@id'] === gid
				|| gid === undefined && g['@id'] === undefined;
		});

		return graph === undefined ? null : graph['@graph'];
	};

	/**
	 * Looks for the first node in the µRDF store with the given input.
	 * 
	 * Returns the node if found, null otherwise.
	 */
	urdf.find = function(id, gid) {
		var graph = urdf.findGraph(gid);

		if (graph === null) return null;

		var node = graph.find(function(n) {
			return n['@id'] !== undefined && n['@id'] === id;
		});
		
		return node === undefined ? null : node;
	};

	/**
	 * Processes a flattened JSON-LD frame object,
	 * interpreted as a query, against the µRDF store
	 * (blank nodes = variables). An optional graph
	 * identifier can be given to reduce the scope of
	 * querying.
	 *
	 * Returns solution mappings as defined by the
	 * SPARQL results JSON format.
	 * See https://www.w3.org/TR/sparql11-results-json/.
	 */
	urdf.query = function(frame, gid) {
		var _node = function(id) {
			if (id === '@type') id = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
			return { '@id': id };
		};

		var _binding = function(f, n) {
			return {
				[urdf.lexicalForm(f)]: urdf.sparqlJsonForm(n)
			};
		};

		var _queryAll = function(f, list, Ω) {
			return list.map(function(n) {
				return _query(f, n, Ω);
			}).reduce(function(Ωp, Ωn) {
				return Ωp.concat(Ωn);
			}, []);
		};

		var _query = function(f, n, Ω) {
			if (!urdf.match(f, n)) {
				return [];
			} else if (urdf.isLiteral(f)) {
				return Ω;
			} else {
				if (urdf.isVariable(f)) {
					// TODO exclude from result if no bnode label
					Ω = _merge(Ω, [_binding(f, n)]);
				}

				if (f['@type'] !== undefined) {
					var types = n['@type'].map(_node);

					var Ωt = f['@type'].filter(function(t) {
						return urdf.isVariable(_node(t))
					}).reduce(function(Ωt, t) {
						return _queryAll(_node(t), types, Ωt);
					}, [{}]);

					Ω = _merge(Ω, Ωt);
				}

				// TODO take 'require all' flag into account (default: true)
				return urdf.signature(f).reduce(function(Ω, p) {
					if (urdf.isVariable(_node(p))) {
						return urdf.signature(n).map(function(p2) {
							return {
								'@id': f['@id'],
								[p2]: f[p]
							};
						}).concat([{
							'@id': f['@id'],
							'@type': f[p].map(function(t) {
								return t['@id'];
							})
						}]).reduce(function(Ω2, f2) {
							var Ω3 = _query(f2, n, Ω);
							var p2 = urdf.signature(f2)[0] || '@type';

							Ω3 = _merge(Ω3, [_binding(_node(p), _node(p2))]);

							return Ω2.concat(Ω3);
						}, []);
					} else {
						return f[p].reduce(function(Ω2, f2) {
							return _queryAll(f2, n[p], Ω2);
						}, Ω);
					}
				}, Ω);
			}
		};

		var _merge = function(Ω1, Ω2) {
			return Ω1.reduce(function(Ω, μ1) {
				return Ω2.reduce(function(Ω, μ2) {
					var μ = urdf.merge(μ1, μ2);

					if (μ !== null) { Ω.push(μ); }

					return Ω;
				}, Ω);
			}, []);
		};

		return frame.reduce(function(Ω, f) {
			var nodes = [];

			if (urdf.isVariable(f)) {
				var name = urdf.lexicalForm(f);

				nodes = Ω.reduce(function(ids, μ) {
					if (μ[name] !== undefined) {
						var t = μ[name].type;
						var v = μ[name].value;

						if (t === 'uri' && ids.indexOf(v) == -1) ids.push(v);
					};

					return ids;
				}, []).map(function(id) {
					return urdf.find(id, gid);
				});

				if (nodes.length === 0) nodes = urdf.findGraph(gid);

				if (nodes === null) return []; 
			} else {
				var n = urdf.find(f['@id'], gid);

				if (n === null) return [];
				else nodes.push(n);
			}

			return _queryAll(f, nodes, Ω);
		}, [{}]);
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
			var v = q['@value'];
			var t = q['@type'] || null;
			var l = q['@language'] || null;

			// TODO support {}
			// TODO support range (i.e. arrays) in q
			return (n['@value'] === v)
				&& (n['@type'] === t || t === null)
				&& (n['@language'] === l || l === null);
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

			var sq = urdf.signature(q);
			var sn = urdf.signature(n);

			return all === false ? _interects(sq, sn) : _isSubset(sq, sn);
		}
	};

	/**
	 * Merges two solution mappings.
	 *
	 * Returns a new mapping object with entries of both input objects
	 * if mappings are compatible, null otherwise.
	 */
	urdf.merge = function(μ1, μ2) {
		var μ = {};

		// TODO datatype, lang
		
		for (var v in μ1) {
			if (μ2[v] !== undefined && μ2[v].value !== μ1[v].value) {
				return null;
			}

			μ[v] = μ1[v];
		}

		for (var v in μ2) {
			if (μ[v] === undefined) μ[v] = μ2[v];
		}
		
		return μ;
	};

	/**
	 * Returns the signature of the input node
	 * (the list of its properties, excluding @-properties).
	 * 
	 * TODO bitmap as in the original impl?
	 */
	urdf.signature = function(obj) {
		var fn = function(p) { return p[0] !== '@' };
		return Object.keys(obj).filter(fn);
	}

	/**
	 * Evaluates if the input object is a variable
	 * (i.e. a blank node).
	 *
	 * Returns true if obj is a variable, false otherwise.
	 */
	urdf.isVariable = function(obj) {
		return obj['@id'] !== undefined && obj['@id'].indexOf('_:') === 0;
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
	 * Evaluates if the input object is a list.
	 * 
	 * Returns true if obj is a list object, false otherwise.
	 */
	urdf.isList = function(obj) {
		return obj['@list'] !== undefined;
	}

	/**
	 * Returns the RDF lexical form of the input object.
	 */
	urdf.lexicalForm = function(obj) {
		if (urdf.isVariable(obj)) return obj['@id'].substring(2);
		else if (urdf.isLiteral(obj)) return obj['@value'];
		else if (urdf.isList(obj)) return obj['@list'];
		else return obj['@id'] ? obj['@id'] : '';
	}

	/**
	 * Returns the SPARQL JSON form of the input object.
	 * 
	 * The format was extended to include RDF lists, which
	 * are not directly accessible from the µRDF store.
	 */
	urdf.sparqlJsonForm = function(obj) {
		var sj = {
			value: urdf.lexicalForm(obj)
		};

		if (urdf.isLiteral(obj)) {
			sj.type = 'literal';

			if (obj['@type']) sj.datatype = obj['@type'];
			if (obj['@language']) sj.lang = obj['@language'];
		} else if (urdf.isVariable(obj)) {
			sj.type = 'bnode';
		} else if (urdf.isList(obj)) {
			sj.type = 'list';
			sj.value = sj.value.map(function(o) { return urdf.sparqlJsonForm(o) });
		} else {
			sj.type = 'uri';
		}

		return sj;
	}
	
	return urdf;
})();