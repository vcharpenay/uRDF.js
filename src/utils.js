'use strict';

// TODO derived from https://github.com/vcharpenay/STTL.js, avoid duplicates?

/**
 * Known URI schemes. See https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml.
 */
const schemes = [
	'about',
	'coap',
	'coap+tcp',
	'coap+ws',
	'coaps',
	'coaps+tcp',
	'coaps+ws',
	'data',
	'did',
	'file',
	'ftp',
	'go',
	'http',
	'https',
	'info',
	'iotdisco',
	'mailto',
	'ni',
	'nih',
	'tag',
	'tel',
	'urn',
	'ws',
	'wss',
	'xmpp',
	'xri'
];

/**
 * Known namespace prefixes.
 */
const ns = {
	rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	xsd: 'http://www.w3.org/2001/XMLSchema#'
};

/**
 * Custom function registry
 */
const registry = {};

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
			datatype: ns.xsd + (Number.isInteger(plain) ? 'integer' : 'decimal'),
			value: String(plain)
		};
	} else if (plain instanceof Date) {
		return {
			type: 'literal',
			datatype: ns.xsd + 'dateTime',
			value: plain.toISOString()
		};
	} else if (typeof plain === 'string') {
		let capture = null;

		if (capture = plain.match(/"([^]*)"(@(.*))?(\^\^(.*))?/)) {
			let [str, lit, at, lang, roof, datatype] = capture;
			let t = {
				type: 'literal',
				value: lit
			};

			if (lang) t.lang = lang;
			if (datatype) t.datatype = datatype;

			return t;
		} else if (schemes.some(s => plain.startsWith(s + ':'))) {
			return {
				type: 'uri',
				value: plain
			};
		} else if (capture = plain.match(/([A-Za-z0-9]+):(.*)/)) {
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
		}
	} else if (typeof plain === 'object') {
		return plain;
	}
	
	return {};
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
	} else if (term.type === 'list') {
		return term.value.map(native);
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
			if (!n) { n = s; f.push(n); }

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
 * Returns a comparison integer (-1, 0 or 1) by comparing
 * expressions for some mappings.
 * 
 * @param {object} mu1 first solution 
 * @param {object} mu2 second solution
 * @param {array} by expressions by which to order 
 */
function compare(mu1, mu2, by) {
	if (!by.length) return 0;

	let head = by[0];
	let tail = by.slice(1);

	let v1 = native(evaluate(head.expression, mu1));
	let v2 = native(evaluate(head.expression, mu2));

	if (head.descending) {
		let v = v1;
		v1 = v2;
		v2 = v;
	}

	if (v1 < v2) return -1;
	else if (v1 > v2) return 1;
  else return compare(mu1, mu2, tail);
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

		case 'isuri':
		case 'isiri':
		case 'isblank':
		case 'isliteral':
		case 'isnumeric':
		case 'str':
		case 'lang':
		case 'datatype':
		case 'uri':
		case 'iri':
		case 'BNODE':
		case 'strdt':
		case 'strlang':
		case 'uuid':
		case 'struuid':
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
		case 'langmatches':
		case 'regex':
		case 'replace':
			return 'stringBuiltIn';

		case 'abs':
		case 'round':
		case 'ceil':
		case 'floor':
		case 'rand':
			return 'numericBuiltIn';
		
		case 'now':
		case 'year':
		case 'month':
		case 'day':
		case 'hours':
		case 'minutes':
		case 'seconds':
		case 'timezone':
		case 'tz':
			return 'dateTimeBuiltIn';

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
			return term(args[0] < args[1]);

		case '>':
			return term(args[0] > args[1]);

		case '<=':
			return term(args[0] <= args[1]);

		case '>=':
			return term(args[0] >= args[1]);

		// arithmetic operators

		case '*':
			return term(args[0] * args[1]);

		case '/':
			// TODO if both integers, return integer
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
		case 'isuri':
		case 'isiri':
			return term(args[0].type === 'uri');
		
		case 'isblank':
			return term(args[0].type === 'bnode');

		case 'isliteral':
			return term(args[0].type === 'literal');

		case 'isnumeric':
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

		case 'uri':
		case 'iri':
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
					   'gen_' + Math.random().toString().substring(2)
			};
		
		case 'strdt':
			return {
				type: 'literal',
				value: args[0].value,
				datatype: args[1].value
			};
		
		case 'strlang':
			return {
				type: 'literal',
				value: args[0].value,
				lang: args[1].value
			};

		case 'uuid':
			// TODO

		case 'struuid':
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
			return term('"' + args[0].substring(0, args[0].indexOf(args[1])) + '"');

		case 'strafter':
			let i = args[0].indexOf(args[1]) + args[1].length;
			return term('"' + args[0].substring(i, args[0].length) + '"');

		case 'encode_for_uri':
			return term('"' + encodeURIComponent(args[0]) + '"');

		case 'concat':
			return term('"'.concat(...args.concat(['"'])));

		case 'langmatches':
			return term(args[0] === args[1] || args[1] === '*');

		case 'regex':
			return term(Boolean(args[0].match(new RegExp(args[1], args[2]))));

		case 'replace':
			return term('"' + args[0].replace(new RegExp(args[1], args[3]), args[2]) + '"');

		default:
			throw new Error('Unknown operator');
	}
}

/**
 * See SPARQL 1.1 Query Language, section 17.4.4 "Functions on Numerics".
 * 
 * @param {string} op the operator
 * @param {array} args operands (or arguments)
 */
function evaluateNumericBuiltInFunction(op, args) {
	args = args.map(arg => native(arg));

	switch (op) {
		case 'abs':
			return term(Math.abs(args[0]));

		case 'round':
			return term(Math.round(args[0]));

		case 'ceil':
			return term(Math.ceil(args[0]));

		case 'floor':
			return term(Math.floor(args[0]));
		
		case 'rand':
			return term(Math.random());

		default:
			throw new Error('Unknown operator');
	}
}

/**
 * See SPARQL 1.1 Query Language, section 17.4.5 "Functions on Dates and Times".
 * 
 * @param {string} op the operator
 * @param {array} args operands (or arguments)
 */
function evaluateDateTimeBuiltInFunction(op, args) {
	args = args.map(arg => native(arg));

	switch (op) {
		case 'now':
			return term(new Date());

		case 'year':
			return term(args[0].getFullYear());

		case 'month':
			return term(args[0].getMonth() + 1);

		case 'day':
			return term(args[0].getDate());

		case 'hours':
			return term(args[0].getHours());

		case 'minutes':
			return term(args[0].getMinutes());

		case 'seconds':
			return term(args[0].getSeconds() + (args[0].getMilliseconds() / 1000));

		case 'timezone':
			// TODO add datatype
			return term(args[0].getTimezoneOffset());

		case 'tz':
			// TODO as string 'hh:mm' or 'Z'
			return term(args[0].getTimezoneOffset());

		default:
			throw new Error('Unknown operator');
	}
}

/**
 * See SPARQL 1.1 Query Language, section 17.5 "XPath Constructor Functions".
 * 
 * @param {string} fn the function IRI as a string
 * @param {*} args operands (or arguments)
 */
function evaluateConstructorFunction(fn, args) {
	// TODO throw error if incompatible arg and if |args| > 1
	let arg = args[0];

	switch (fn) {
		case ns.xsd + 'boolean':
		case ns.xsd + 'double':
		case ns.xsd + 'float':
		case ns.xsd + 'decimal':
		case ns.xsd + 'integer':
		case ns.xsd + 'dateTime':
		case ns.xsd + 'string':
			return {
				type: 'literal',
				datatype: fn,
				value: arg.value
			};

		default:
			throw new Error('Unknown function');
	}
}

// FIXME bindingSet, not binding
// TODO other strategy: turn into a JS expression?
function evaluate(expr, binding) {
	if (typeof expr === 'string') {
		if (expr.startsWith('?')) {
			let name = expr.substring(1);
			if (binding[name]) return binding[name];
			else throw new EvaluationError('No binding found for ' + expr);
		} else {
			return term(expr);
		}
    } else if (expr.type === 'operation') {
		if (expr.operator === 'if') {
			let [condition, first, second] = expr.args;
			let bool = native(evaluate(condition, binding));
			return evaluate(bool ? first : second, binding);
		} else if (expr.operator === 'bound') {
			let name = expr.args[0].substring(1);
			return term(Boolean(binding[name]));
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

				case 'numericBuiltIn':
					return evaluateNumericBuiltInFunction(op, args);

				case 'dateTimeBuiltIn':
					return evaluateDateTimeBuiltInFunction(op, args);

				default:
					throw new Error('Operator not implemented: ' + expr.operator);
			}
		}
    } else if (expr.type === 'functionCall') {
		let name = expr.function;
		let args = expr.args.map(arg => evaluate(arg, binding));

		if (name.startsWith(ns.xsd)) {
			return evaluateConstructorFunction(name, args);
		} else {
			if (!registry[name]) {
				throw new EvaluationError('Custom function not registered');
			}

			try {
				let val = registry[name](...args.map(native));
				let t = term(val);

				if (!t.value) {
					// assuming plain literal
					t = {
						type: 'literal',
						value: val
					};
				}
	
				return t;
			} catch (e) {
				throw new EvaluationError(e);
			}
		}
    }
}

/**
 * Registers a custom SPARQL function. Callback arguments will
 * be passed as native JavaScript values. IRIs and blank nodes are
 * converted to strings. The function return value will be
 * converted to a SPARQL JSON form as follows:
 *  - if it is an object, it is returned as is
 *  - if it is a boolean or number, it is converted to a typed literal
 *  - if it is a string, it is converted to a plain literal
 * 
 * See SPARQL 1.1 Query Language, section 17.6 "Extensible Value Testing".
 * 
 * @param {string} name the function name (an IRI)
 * @param {function} fn the callback function
 */
function register(name, fn) {
	registry[name] = fn;
}

/**
 * Error occurring during evaluation of some SPARQL expression
 * (e.g. binding missing or incompatible datatypes)
 * 
 * @param {string} message some error message
 */
class EvaluationError extends Error {
	constructor(...args) { super(...args); }
}

module.exports.term = term;
module.exports.native = native;
module.exports.ebv = ebv;
module.exports.frame = frame;
module.exports.compare = compare;
module.exports.evaluate = evaluate;
module.exports.register = register;
module.exports.EvaluationError = EvaluationError;