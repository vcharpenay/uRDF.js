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
			return {
				type: 'literal',
				value: lit,
				lang: lang,
				datatype: datatype
			}
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
        if (!n[p]) n[p] = [];

        let o = nodeOrValue(term(tp.object));
        if (p === '@type') o = o['@id'];
        n[p].push(o);

        return f;
    }, []);
}

function isBinaryOperator(op) {
	return [
		'||', '&&', '=', '!=',
		'<', '>', '<=', '>=',
		'*', '/', '+', '-'
	].indexOf(op) > -1;
}

function evaluateBinaryOperation(expr, binding) {
	let [first, second] = expr.args;
	first = native(evaluate(first, binding));
	second = native(evaluate(second, binding));

	// TODO test whole XML operator mapping
	// SPARQL 17.3

	switch (expr.operator) {
		// logical operators

		case '||':
			return term(first || second);

		case '&&':
			return term(first && second);

		case '=':
			return term(first === second);

		case '!=':
			return term(first != second);

		case '<':
			return term(first != second);

		case '>':
			return term(first != second);

		case '<=':
			return term(first != second);

		case '>=':
			return term(first != second);

		// arithmetic operators

		case '*':
			return term(first * second);

		case '/':
			return term(first / second);

		case '+':
			return term(first + second);
		
		case '-':
			return term(first - second);

		default:
			throw new Error('Unknown operator');
	}
}

// FIXME bindingSet, not binding
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
		} else if (isBinaryOperator(expr.operator)) {
			return evaluateBinaryOperation(expr, binding);
		} else {
			throw new Error('Operator not implemented: ' + expr.operator);
		}
    } else if (expr.type === 'function') {
        // TODO get registered functions and execute
		throw new Error('Not implemented');
    }
}

module.exports.ebv = ebv;
module.exports.frame = frame;
module.exports.evaluate = evaluate;