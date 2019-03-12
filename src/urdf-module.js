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
 * Evaluates a SPARQL query pattern and returns bindings.
 * 
 * @param {object} pattern the query pattern
 */
function evaluate(pattern) {
    switch (pattern.type) {
        case 'bgp':
            let f = utils.frame(pattern);
            return urdf.query(f);
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

    let operations = ast.where.filter(p => p.type != 'filter');
    let filters = ast.where.filter(p => p.type === 'filter');

    let results = operations
        .map(op => evaluate(op))
        .reduce((merged, bs) => bs); // TODO merge bindings
    
    return filters.reduce((res, f) => {
        return res.filter(b => {
            let bool = utils.evaluate(f.expression, b);
            return utils.native(bool);
        });
    }, results);
}

module.exports.size = urdf.size;
module.exports.clear = urdf.clear;
module.exports.load = load;
module.exports.query = query;