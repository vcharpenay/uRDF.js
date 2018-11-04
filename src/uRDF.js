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
	 * contain the @reverse keyword and the root object
	 * must not be a variable.
	 *
	 * Returns mappings as the object [{
	 *   "var1": { "@id" }, // if IRI or blank node 
	 *   "var2": { "@value" } // if literal
	 * }, {
	 *   // ...
	 * }].
	 */
	urdf.query = function(obj) {
		var _query = function(q, s, bindings) {
			var signature = Object.keys(q);

			// TODO take 'require all' flag into account (default: true)
			var includes = signature.every(function (p) {
				return p === '@id' || s[p] !== undefined;
			});
			
			if (!includes) {
				bindings = [];
			} else {
				bindings = signature.reduce(function(b, p) {
					if (b === []) {
						return b;
					} else {
						if (p !== '@id' && s[p] !== undefined) {
							for (var i in q[p]) {
								// TODO use q[p].reduce()
								var o = q[p][i];
		
								if (urdf.isLiteral(o)) {
									// TODO pattern matching
								} else {
									if (urdf.isVariable(o)) {
										var matches = s[p].map(function(n) {
											// indexed by variable name
											return { [urdf.lexicalForm(o)]: { ['@id']: n['@id'] } };
										});
		
										if (b === null) {
											b = matches;
										} else {
											// Cartesian product
											var product = [];
											
											matches.forEach(function(m) {
												b.forEach(function(b) {
													product.push(urdf.merge(b, m));
												});
											});
											
											b = product;
										}
										
										// TODO join if bindings already available
									} else {
										var exists = s[p].some(function(n) {
											return n['@id'] === o['@id'];
										});
										
										if (!exists) {
											b = [];
										}
									}
								}
							}
						}

						// TODO recursive call
						return b;
					}
				}, null);
			}
			
			return bindings;
		};
		
		// TODO build query plan by restructuring query
		
		var n = urdf.find(obj['@id']);
		
		if (n === null) {
			return [];
		} else {
			return _query(obj, n, []);
		}
	};

	/**
	 * Merges two bindings
	 *
	 * Returns a new binding object with entries of both input objects.
	 */
	urdf.merge = function(b1, b2) {
		var b = {};
		
		for (var v in b1) { b[v] = b1[v]; }
		// TODO check binding compatibility
		for (var v in b2) { b[v] = b2[v]; }
		
		return b;
	};

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