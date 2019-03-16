'use strict';

const fs = require('fs');

const utils = require('./utils.js');
const urdf = eval(fs.readFileSync('src/urdf.js', 'utf-8')); // FIXME absolute path?

const parser = new require('sparqljs').Parser();

/**
 * Returns the name of the input variable.
 * 
 * @param {string} variable a variable (starting with '?')
 */
function name(variable) {
    if (variable[0] != '?') throw new Error(variable + ' is not a variable');
    return variable.substring(1);
}

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
 * Merges solutions and returns either compatible mappings (pure join)
 * or all mappings of first input set, merged if possible (left outer join).
 * 
 * @param {array} omega1 first set of solution mappings
 * @param {array} omega2 second set of solution mappings
 * @param {boolean} opt optional flag for left outer join
 */
function merge(omega1, omega2, opt) {
    return omega1.reduce((omega, mu1) => {
        return omega2.reduce((omega, mu2) => {
            let mu = urdf.merge(mu1, mu2);

            if (mu) omega.push(mu);
            else if (opt) omega.push(mu1);

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
    let main = patterns.filter(p => p.type != 'bind' && p.type != 'filter');
    let b = patterns.filter(p => p.type === 'bind');
    let f = patterns.filter(p => p.type === 'filter');

    let reordered = main.concat(b, f);

    return reordered.reduce((omega, p) => {
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
            let g = {
                type: 'group',
                patterns: pattern.patterns
            };
            omega = evaluate(g, mappings);
            return merge(mappings, omega, true);

        case 'bgp':
            let f = utils.frame(pattern);
            omega = urdf.query(f);
            return merge(mappings, omega);

        case 'values':
            omega = pattern.values.map(map => {
                let mu = {};
                for (let v in map) mu[name(v)] = utils.term(map[v]);
                return mu;
            });
            return merge(mappings, omega);

        case 'bind':
            return mappings
                .map(mu => {
                    let n = name(pattern.variable);
                    let binding = {
                        [n]: utils.evaluate(pattern.expression, mu)
                    };
                    return urdf.merge(mu, binding);
                })
                .filter(mu => mu);

        case 'minus':
            omega = evaluateAll(pattern.patterns);
            return mappings.filter(mu1 => {
                return omega.every(mu2 => !urdf.merge(mu1, mu2));
            });

        case 'filter':
            // TODO optimize 'not/exists' filter: stop at first mapping
            switch (pattern.expression.operator) {
                case 'exists':
                    return mappings.filter(mu => {
                        let p = pattern.expression.args[0];
                        return evaluate(p, [mu]).length > 0;
                    });

                case 'notexists':
                    return mappings.filter(mu => {
                        let p = pattern.expression.args[0];
                        return evaluate(p, [mu]).length === 0;
                    });

                default:
                    return mappings.filter(mu => {
                        let bool = utils.evaluate(pattern.expression, mu);
                        return utils.ebv(bool);
                    });
            }

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