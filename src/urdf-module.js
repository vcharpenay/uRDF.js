'use strict';

const fs = require('fs');

const utils = require('./utils.js');
const urdf = eval(fs.readFileSync('src/urdf.js', 'utf-8')); // FIXME absolute path?

const parser = new require('sparqljs').Parser();

/**
 * Loads the input JSON-LD in the µRDF store.
 * 
 * @param {object | array} json some JSON-LD definition(s)
 */
function load(json) {
    // TODO normalize, compact
    return urdf.load(json);
}

/**
 * Merges solutions and return compatible mappings only.
 * 
 * @param {array} omega1 first set of solution mappings
 * @param {array} omega2 second set of solution mappings
 */
function merge(omega1, omega2) {
    if (!omega1.length || !omega2.length) return [];

    return omega1.reduce((omega, mu1) => {
        return omega2.reduce((omega, mu2) => {
            let mu = urdf.merge(mu1, mu2);
            if (mu) omega.push(mu);
            return omega;
        }, omega);
    }, []);
}

/**
 * Sequentially evaluates a list of SPARQL query patterns.
 * 
 * @param {array} patterns array of pattern objects 
 * @param {array} mappings current mappings
 */
function evaluateAll(patterns) {
    // TODO reorder bind, filter, optional?

    return patterns.reduce((omega, p) => {
        return evaluate(p, omega);
    }, [{}]);
}

/**
 * Evaluates a SPARQL query pattern and returns mappings.
 * 
 * @param {object} pattern the query pattern
 * @param {array} mappings current mappings
 */
function evaluate(pattern, mappings) {
    let omega = [];

    switch (pattern.type) {
        case 'group':
            return pattern.patterns.length > 0 ?
                   evaluateAll(pattern.patterns) :
                   mappings;

        case 'union':
            return pattern.patterns
                .map(p => evaluate(p, mappings))
                .reduce((union, omega) => union.concat(omega));

        case 'optional':
            // TODO
            break;

        case 'bgp':
            let f = utils.frame(pattern);
            omega = urdf.query(f) || [];
            return merge(mappings, omega);

        case 'bind':
            return mappings
                .map(mu => {
                    // TODO utils.term?
                    let name = pattern.variable.substring(1);
                    let binding = {
                        [name]: utils.evaluate(pattern.expression, mu)
                    };
                    return urdf.merge(mu, binding);
                })
                .filter(mu => mu);

        case 'filter':
            return mappings.filter(mu => {
                let bool = utils.evaluate(pattern.expression, mu);
                return utils.ebv(bool);
            });

        default:
            throw new Error('Query pattern not supported or unknown');
    }
}

/**
 * Processes the input query and returns mappings as SPARQL JSON or a JSON-LD graph.
 * 
 * @param {string} sparql a SPARQL query as string
 */
function query(sparql) {
    let ast = parser.parse(sparql);

    let mappings = evaluateAll(ast.where);

    // TODO SELECT projection

    return mappings;
}

module.exports.size = urdf.size;
module.exports.clear = urdf.clear;
module.exports.load = load;
module.exports.query = query;