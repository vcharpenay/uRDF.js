'use strict';

// TODO derived from https://github.com/vcharpenay/STTL.js, avoid duplicates?

/**
 * Known namespace prefixes.
 */
let ns = {
	rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	xsd: 'http://www.w3.org/2001/XMLSchema#'
};

/**
 * Transforms a N3.js representation of an RDF term
 * or a native JS value to a SPARQL JSON object.
 */
function term(plain) {
	if (typeof plain === 'boolean') {
		return {
			type: 'literal',
			datatype: ns.xsd + 'boolean',
			value: String(plain)
		};
	} else if (typeof plain === 'number') {
		return {
			type: 'literal',
			datatype: ns.xsd + 'decimal', // TODO detect integer
			value: String(plain)
		};
	} else if (typeof plain === 'string') {
		let capture = null;

		if (capture = plain.match(/"([^]*)"(@.*)?(\^\^(.*))?/)) {
			let [str, lit, lang, suffix, datatype] = capture;
			let t = {
				type: 'literal',
				value: lit
			};

			if (lang) t.lang = lang;
			if (datatype) t.datatype = datatype;

			return t;
		} else if (plain.match(/^(([^:\/?#]+):)(\/\/([^\/?#]*))([^?#]*)(\?([^#]*))?(#(.*))?/)) {
			return {
				type: 'uri',
				value: plain
			};
		} else if (capture = plain.match(/(\w*):(.*)/)) {
			let [str, prefix, name] = capture; 
			return {
				type: 'uri',
				value: ns[prefix] + name
			};
		} else if (capture = plain.match(/_:(.*)/)) {
			let [str, name] = capture; 
			return {
				type: 'bnode',
				value: name
			}
		} else if (capture = plain.match(/\?(.+)/)) {
			let [qmark, name] = capture;
			return {
				type: 'variable',
				value: name
			}
		} else {
			return {};
		}
	}
}

/**
 * Transforms a SPARQL JSON object to a JSON-LD term.
 * 
 * @param {string} term the SPARQL JSON object
 */
function nodeOrValue(term) {
	switch (term.type) {
		case 'uri':
			return { '@id': term.value };

		case 'bnode':
		case 'variable':
			return { '@id': '_:' + term.value };

		case 'literal':
		default:
			return {
				'@value': term.value,
				'@language': term.language,
				'@type': term.datatype
			};
	}
}

/**
 * Turns a SPARQL JSON object into a native JS constant:
 *  - xsd:boolean to Boolean
 *  - xsd:float, xsd:long, xsd:integer and derivative to Number
 *  - xsd:dateTime, xsd:date and xsd:time to Date
 *  - xsd:string to String
 *  - literals with no datatype default to String (lexical value)
 * 
 * @param {object} term the SPARQL JSON object
 */
function native(term) {
	if (term.type === 'uri') {
		return term.value;
	} else if (term.type === 'bnode') {
		return '_:' + term.value;
	} else { // all literals
		switch (term.datatype) {
			case ns.xsd + 'boolean':
				switch (term.value) {
					case 'true':
					case 'false':
						return (term.value === 'true');
						
					default:
						throw new Error('Term is not a boolean: ' + term);
				}
				
			case ns.xsd + 'decimal':
			case ns.xsd + 'float':
			case ns.xsd + 'double':
			case ns.xsd + 'integer':
			case ns.xsd + 'nonPositiveInteger':
			case ns.xsd + 'negativeInteger':
			case ns.xsd + 'nonNegativeInteger':
			case ns.xsd + 'positiveInteger':
			case ns.xsd + 'unsignedLong':
			case ns.xsd + 'unsignedInt':
			case ns.xsd + 'unsignedShort':
			case ns.xsd + 'unsignedByte':
			case ns.xsd + 'long':
			case ns.xsd + 'int':
			case ns.xsd + 'short':
			case ns.xsd + 'byte':
				return Number(term.value);

			case ns.xsd + 'dateTime':
			case ns.xsd + 'date':
			case ns.xsd + 'time':
				return new Date(term.value);

			case ns.xsd + 'string':
			default:
				return term.value;
		}
	}
}

/**
 * Computes the Effective Boolean Value (EBV) of a term.
 * 
 * @param {object} term the term as a SPARQL JSON object
 */
function ebv(term) {
	if (term.type && term.type != 'literal') {
		throw new Error('No boolean value can be computed for term: ' + term);
	}
	
	return Boolean(native(term));
}

/**
 * Turns the input BGP into a normalized JSON-LD frame.
 * 
 * @param {object} bgp a BGP pattern as object (abstract syntax tree)
 */
function frame(bgp) {
    return bgp.triples.reduce((f, tp) => {
        let s = nodeOrValue(term(tp.subject));
        let n = f.find(n => n['@id'] === s['@id']);
        if (!n) {
            n = s;
            f.push(n);
        }

        let p = (tp.predicate === ns.rdf + 'type') ?
				'@type' : tp.predicate;
		if (p[0] === '?') p = '_:' + p.substring(1);
        if (!n[p]) n[p] = [];

        let o = nodeOrValue(term(tp.object));
        if (p === '@type') o = o['@id'];
        n[p].push(o);

        return f;
    }, []);
}

/**
 * Returns an operator type for some input operator
 * (merely to aggregate operation evaluation).
 * 
 * @param {string} op the operator
 */
function opType(op) {
	switch (op) {
		case '!':
		case '||':
		case '&&':
		case '=':
		case '!=':
		case '<':
		case '>':
		case '<=':
		case '>=':
		case '*':
		case '/':
		case '+':
		case '-':
			return 'base';

		case 'isBlank':
		case 'isLiteral':
		case 'isNumeric':
		case 'str':
		case 'lang':
		case 'datatype':
		case 'URI':
		case 'IRI':	
		case 'BNODE':
		case 'STRDT':
		case 'STRLANG':
		case 'UUID':
		case 'STRUUID':
			return 'termBuiltIn';

		case 'strlen':
		case 'substr':
		case 'ucase':
		case 'lcase':
		case 'strstarts':
		case 'strends':
		case 'contains':
		case 'strbefore':
		case 'strafter':
		case 'encode_for_uri':
		case 'concat':
		case 'langMatches':
		case 'regex':
		case 'replace':
			return 'stringBuiltIn';

		default:
			throw new Error('Operator unknown: ' + expr.operator);
	}
}

/**
 * See SPARQL 1.1 Query Language, section 17.3 "Operator Mapping".
 * 
 * @param {string} op the operator
 * @param {array} args operands (or arguments)
 */
function evaluateBaseOperation(op, args) {
	args = args.map(arg => native(arg));

	// TODO test whole XML operator mapping
	// SPARQL 17.3

	switch (op) {
		// logical operators

		case '!':
			return term(!args[0]);

		case '||':
			return term(args[0] || args[1]);

		case '&&':
			return term(args[0] && args[1]);

		case '=':
			return term(args[0] === args[1]);

		case '!=':
			return term(args[0] != args[1]);

		case '<':
			return term(args[0] > args[1]);

		case '>':
			return term(args[0] < args[1]);

		case '<=':
			return term(args[0] <= args[1]);

		case '>=':
			return term(args[0] >= args[1]);

		// arithmetic operators

		case '*':
			return term(args[0] * args[1]);

		case '/':
			return term(args[0] / args[1]);

		case '+':
			return term(args[0] + args[1]);
		
		case '-':
			return term(args[0] - args[1]);

		default:
			throw new Error('Unknown operator');
	}
}

/**
 * See SPARQL 1.1 Query Language, section 17.4.2 "Functions on RDF Terms".
 * 
 * @param {string} op the operator
 * @param {array} args operands (or arguments)
 */
function evaluateTermBuiltInFunction(op, args) {
	switch (op) {
		case 'isIRI':
			return term(args[0].type === 'uri');
		
		case 'isBlank':
			return term(args[0].type === 'bnode');

		case 'isLiteral':
			return term(args[0].type === 'literal');

		case 'isNumeric':
			return term(typeof native(args[0]) === 'number');

		case 'str':
			// TODO deal with bnodes?
			return {
				type: 'literal',
				value: args[0].value
			};

		case 'lang':
			return {
				type: 'literal',
				value: args[0].lang || ''
			};

		case 'datatype':
			return {
				type: 'literal',
				value: args[0].datatype || (ns.xsd + 'string')
			};

		case 'URI':
		case 'IRI':
			return {
				type: 'uri',
				value: args[0].value // TODO resolve IRI
			};

		case 'BNODE':
			return {
				type: 'bnode',
				value: args[0] ?
					   args[0].value :
					   // TODO not the most reliabe ID generator...
					   Math.random().toString().substring(2)
			};
		
		case 'STRDT':
			return {
				type: 'literal',
				value: args[0].value,
				datatype: args[1].value
			};
		
		case 'STRLANG':
			return {
				type: 'literal',
				value: args[0].value,
				lang: args[1].value
			};

		case 'UUID':
			// TODO

		case 'STRUUID':
			// TODO

		default:
			throw new Error('Unknown operator');
	}
}

/**
 * See SPARQL 1.1 Query Language, section 17.4.3 "Functions on Strings".
 * 
 * @param {string} op the operator
 * @param {array} args operands (or arguments)
 */
function evaluateStringBuiltInFunction(op, args) {
	args = args.map(arg => native(arg));

	// TODO check args length depending on function arity?
	// TODO throw error when arguments not compatible
	switch (op) {
		case 'strlen':
			return term(args[0].length);

		case 'substr':
			return term('"' + args[0].substr(args[1], args[2]) + '"');

		case 'ucase':
			return term('"' + args[0].toUpperCase() + '"');

		case 'lcase':
			return term('"' + args[0].toLowerCase() + '"');

		case 'strstarts':
			return term(args[0].startsWith(args[1]));

		case 'strends':
			return term(args[0].endsWith(args[1]));

		case 'contains':
			return term(args[0].includes(args[1]));

		case 'strbefore':
			// TODO

		case 'strafter':
			// TODO

		case 'encode_for_uri':
			return term('"' + encodeURIComponent(args[0]) + '"');

		case 'concat':
			return term('"'.concat(...args.concat(['"'])));

		case 'langMatches':
			// TODO

		case 'regex':
			return term(Boolean(args[0].match(new RegExp(args[1], args[2]))));

		case 'replace':
			return term('"' + args[0].replace(new RegExp(args[1], args[3]), args[2]) + '"');

		default:
			throw new Error('Unknown operator');
	}
}

// FIXME bindingSet, not binding
// TODO other strategy: turn into a JS expression?
function evaluate(expr, binding) {
	if (typeof expr === 'string') {
		if (expr.startsWith('?')) {
			return binding[expr.substring(1)];
			// TODO check if no binding available?
		} else {
			return term(expr);
		}
    } else if (expr.type === 'operation') {
		if (expr.operator === 'if') {
			let [condition, first, second] = expr.args;
			let bool = native(evaluate(condition, binding));
			return evaluate(bool ? first : second, binding);
		} else if (expr.operator === 'bound') {
			// TODO
		} else {
			let op = expr.operator;
			let args = expr.args.map(arg => evaluate(arg, binding));

			switch (opType(op)) {
				case 'base':
					return evaluateBaseOperation(op, args);

				case 'termBuiltIn':
					return evaluateTermBuiltInFunction(op, args);

				case 'stringBuiltIn':
					return evaluateStringBuiltInFunction(op, args);

				default:
					throw new Error('Operator not implemented: ' + expr.operator);
			}
		}
    } else if (expr.type === 'function') {
        // TODO get registered functions and execute
		throw new Error('Not implemented');
    }
}

module.exports.term = term;
module.exports.ebv = ebv;
module.exports.frame = frame;
module.exports.evaluate = evaluate;