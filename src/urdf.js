'use strict';

/**
 * See Store.size(). 
 */
function size(store, gid) {
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
 * See Store.load().
 */
function load(store, json, gid) {
	json.forEach(function(n) {
		var s = find(store, n['@id'], gid);
		
		if (s === null) {
			// TODO copy instead
			var g = findGraph(store, gid);

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
	
	return true;
};

/**
 * See Store.clear().
 */
function clear(store, gid) {
	if (gid !== undefined) {
		var idx = store.findIndex(function(g) {
			return g['@id'] === gid;
		});

		if (idx < 0) return false;

		store.splice(idx, 1);
	} else {
		store.splice(0);

		store.push({
			// default graph
			'@graph': []
		});
	}

	return true;
};

/**
 * See Store.listGraphs().
 */
function listGraphs(store) {
	return store.map(function(g) {
		return g['@id'];
	}).filter(function(name) {
		return name !== undefined
	});
};

/**
 * See Store.findGraph().
 */
function findGraph(store, gid) {
	var graph = store.find(function(g) {
		return gid !== undefined && g['@id'] === gid
			|| gid === undefined && g['@id'] === undefined;
	});

	return graph === undefined ? null : graph['@graph'];
};

/**
 * See Store.find().
 */
function find(store, id, gid) {
	var graph = findGraph(store, gid);

	if (graph === null) return null;

	var node = graph.find(function(n) {
		return n['@id'] !== undefined && n['@id'] === id;
	});
	
	return node === undefined ? null : node;
};

/**
 * See Store.query().
 */
function query(store, frame, gid) {
	var _node = function(id) {
		if (id === '@type') id = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
		return { '@id': id };
	};

	var _binding = function(f, n) {
		return {
			[lexicalForm(f)]: sparqlJsonForm(n)
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
		if (!match(f, n)) {
			return [];
		} else if (isLiteral(f)) {
			return Ω;
		} else {
			if (isVariable(f)) {
				// TODO exclude from result if no bnode label
				Ω = _merge(Ω, [_binding(f, n)]);
			}

			if (f['@type'] !== undefined) {
				var types = n['@type'].map(_node);

				var Ωt = f['@type'].filter(function(t) {
					return isVariable(_node(t))
				}).reduce(function(Ωt, t) {
					return _queryAll(_node(t), types, Ωt);
				}, [{}]);

				Ω = _merge(Ω, Ωt);
			}

			// TODO take 'require all' flag into account (default: true)
			return signature(f).reduce(function(Ω, p) {
				if (isVariable(_node(p))) {
					return signature(n).map(function(p2) {
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
						var p2 = signature(f2)[0] || '@type';

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
				var μ = merge(μ1, μ2);

				if (μ !== null) { Ω.push(μ); }

				return Ω;
			}, Ω);
		}, []);
	};

	return frame.reduce(function(Ω, f) {
		var nodes = [];

		if (isVariable(f)) {
			var name = lexicalForm(f);

			nodes = Ω.reduce(function(ids, μ) {
				if (μ[name] !== undefined) {
					var t = μ[name].type;
					var v = μ[name].value;

					if (t === 'uri' && ids.indexOf(v) == -1) ids.push(v);
				};

				return ids;
			}, []).map(function(id) {
				return find(store, id, gid) || { '@id': id };
			});

			if (nodes.length === 0) nodes = findGraph(store, gid);

			if (nodes === null) return []; 
		} else {
			var n = find(store, f['@id'], gid);

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
function match(q, n, all) {
	if (isLiteral(q)) {
		var v = q['@value'];
		var t = q['@type'] || null;
		var l = q['@language'] || null;

		// TODO support {}
		// TODO support range (i.e. arrays) in q
		return (n['@value'] === v)
			&& (n['@type'] === t || t === null)
			&& (n['@language'] === l || l === null);
	} else {
		if (!isVariable(q) && q['@id'] !== n['@id']) {
			return false;
		}

		var _intersects = function(a, b) {
			if (a === undefined) {
				return true;
			} else if (b === undefined && a.length > 0) {
				return false;
			} else {
				return a.some(function(elem) {
					return isVariable({ '@id': elem }) || b.indexOf(elem) > -1;
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
					return isVariable({ '@id': elem }) || b.indexOf(elem) > -1;
				});
			}
		};

		var sq = signature(q);
		var sn = signature(n);

		return all === false ? _interects(sq, sn) : _isSubset(sq, sn);
	}
};

/**
 * Merges two solution mappings.
 *
 * Returns a new mapping object with entries of both input objects
 * if mappings are compatible, null otherwise.
 */
function merge(μ1, μ2) {
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
function signature(obj) {
	var fn = function(p) { return p[0] !== '@' };
	return Object.keys(obj).filter(fn);
}

/**
 * Evaluates if the input object is a variable
 * (i.e. a blank node).
 *
 * Returns true if obj is a variable, false otherwise.
 */
function isVariable(obj) {
	return obj['@id'] !== undefined && obj['@id'].indexOf('_:') === 0;
};

/**
 * Evaluates if the input object is a literal.
 *
 * Returns true if obj is a literal, false otherwise.
 */
function isLiteral(obj) {
	return obj['@value'] !== undefined;
};

/**
 * Evaluates if the input object is a list.
 * 
 * Returns true if obj is a list object, false otherwise.
 */
function isList(obj) {
	return obj['@list'] !== undefined;
}

/**
 * Returns the RDF lexical form of the input object.
 */
function lexicalForm(obj) {
	if (isVariable(obj)) return obj['@id'].substring(2);
	else if (isLiteral(obj)) return obj['@value'];
	else if (isList(obj)) return obj['@list'];
	else return obj['@id'] ? obj['@id'] : '';
}

/**
 * Returns the SPARQL JSON form of the input object.
 * 
 * The format was extended to include RDF lists, which
 * are not directly accessible from the µRDF store.
 */
function sparqlJsonForm(obj) {
	var sj = {
		value: lexicalForm(obj)
	};

	if (isLiteral(obj)) {
		sj.type = 'literal';

		if (obj['@type']) sj.datatype = obj['@type'];
		if (obj['@language']) sj.lang = obj['@language'];
	} else if (isVariable(obj)) {
		sj.type = 'bnode';
	} else if (isList(obj)) {
		sj.type = 'list';
		sj.value = sj.value.map(function(o) { return sparqlJsonForm(o) });
	} else {
		sj.type = 'uri';
	}

	return sj;
}

/**
 * Single instance of the µRDF store, with its own dataset.
 */
function Store() {
	/**
	 * A JSON-LD context URI providing mappings
	 * from JSON keys to RDF IRIs.
	 */
	this.context = '';

	/**
	 * The µRDF store data structure (private member).
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
	this.size = function(gid) { return size(store, gid); };

	/**
	 * Loads a flattened (and compacted) JSON-LD document into the µRDF store.
	 * 
	 * Returns true if no error occurred, false otherwise.
	 */
	this.load = function(json, gid) { return load(store, json, gid); };

	/**
	 * Empties the content of the µRDF store or of a named graph, if provided.
	 * 
	 * Returns true.
	 */
	this.clear = function(gid) { return clear(store, gid); };

	/**
	 * Lists all named graph in the µRDF store.
	 * 
	 * Returns a (possibly empty) list of graph identifiers.
	 */
	this.listGraphs = function() { return listGraphs(store); };

	/**
	 * Looks for a named graph with the given identifier in the µRDF store
	 * or the default graph if no identifier is provided.
	 * 
	 * Returns the graph's node list if found, the default graph otherwise.
	 */
	this.findGraph = function(gid) { return findGraph(store, gid); };

	/**
	 * Looks for the first node in the µRDF store with the given input.
	 * 
	 * Returns the node if found, null otherwise.
	 */
	this.find = function(id, gid) { return find(store, id, gid); };

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
	this.query = function(frame, gid) { return query(store, frame, gid); };
}

module.exports.Store = Store;
module.exports.merge = merge;
module.exports.signature = signature;