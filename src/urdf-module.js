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
 * Evaluates a SPARQL query pattern and returns bindings.
 * 
 * @param {object} pattern the query pattern
 */
function evaluate(pattern) {
    switch (pattern.type) {
        // TODO union, optional
        
        case 'group':
            // FIXME filters must be evaluated per group
            // FIXME ignore {}
            return pattern.patterns
                .map(p => evaluate(p))
                .reduce((res, omega) => merge(res, omega));

        case 'union':
            return pattern.patterns
                .map(p => evaluate(p))
                .reduce((res, omega) => res.concat(omega));

        case 'bgp':
            let f = utils.frame(pattern);
            return urdf.query(f) || [];

        default: throw new Error('Query pattern not supported or unknown');
    }
}

/**
 * Processes the input query and returns bindings as SPARQL JSON or a JSON-LD graph.
 * 
 * @param {string} sparql a SPARQL query as string
 */
function query(sparql) {
    let ast = parser.parse(sparql);

    let patterns = ast.where.filter(p => p.type != 'bind' && p.type != 'filter');

    let root = patterns.length === 1 ?
               patterns[0] : {
                   type: 'group',
                   patterns: patterns
               };
    let results = evaluate(root);

    let binds = ast.where.filter(p => p.type === 'bind');

    if (binds.length > 0) {
        results = results.reduce((res, mu) => {
            // note: operational semantics -> multiple definitions, last taken
            let bindings = binds.reduce((bs, b) => {
                let term = utils.evaluate(b.expression, mu);
                bs[b.variable.substring(1)] = term; // TODO utils.term?
                return bs;
            }, {});
            let merged = urdf.merge(mu, bindings);
            if (merged) res.push(merged);
            return res;
        }, []);
    }

    let filters = ast.where.filter(p => p.type === 'filter');

    if (filters) {
        results = filters.reduce((res, f) => {
            return res.filter(b => {
                let bool = utils.evaluate(f.expression, b);
                return utils.ebv(bool);
            });
        }, results);
    }

    // TODO SELECT projection
    return results;
}

module.exports.size = urdf.size;
module.exports.clear = urdf.clear;
module.exports.load = load;
module.exports.query = query;