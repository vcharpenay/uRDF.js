'use strict';

const fs = require('fs');

const utils = require('./utils.js');
const urdf = require('./urdf.js');

const n3 = require('n3');
const jsonld = require('jsonld');
const sparqljs = require('sparqljs');

const processor = jsonld.promises;
const parser = new sparqljs.Parser();

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
 * Computes whether two solution mappings intersect, i.e. whether:
 *  - their domains (sets of variables) overlap and
 *  - their intersection is a valid mapping.
 * 
 * @param {object} mu1 first solution mapping
 * @param {object} mu2 second solution mappoing
 */
function intersect(mu1, mu2) {
    if (!Object.keys(mu1).some(v => mu2[v])) return false;
    else return Boolean(urdf.merge(mu1, mu2));
}

/**
 * Finds a given node (optionally in some named graph) and returns it.
 * 
 * @param {string} id a node identifier (an IRI)
 * @param {string} gid a graph identifier (an IRI)
 */
function find(id, gid) {
    return new Promise((resolve, reject) => {
        let node = urdf.find(id, gid);

        // TODO deal with compacted form when time comes
        // TODO return copy instead of actual object?
        // TODO do not reject if node not found?
        if (node) resolve(node);
        else reject(new Error('Node not found'));
    });
}

/**
 * Provides a Promise-based wrapper for core clear function.
 * 
 * @param {string} gid a graph identifier (an IRI)
 */
function clear(gid) {
    return new Promise((resolve, reject) => {
        urdf.clear(gid);
        resolve();
    });
}

/**
 * Loads the input definitions in the µRDF store.
 * 
 * @param {object | array | string} data some JSON-LD definition(s)
 * or some RDF triples serialialized as a string
 * @param {object} opts options as an object (passed to N3.js)
 */
function load(data, opts) {
    return new Promise((resolve, reject) => {
        switch (typeof data) {
            case 'string':
                if (opts && opts.format === 'application/ld+json') {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    const def = { format: 'application/n-quads' };
    
                    let p = new n3.Parser(opts);
                    let w = new n3.Writer(def);
    
                    // TODO use stream API...?
                    p.parse(data, (err, quad) => {
                        if (err) reject(err);
    
                        else if (quad) w.addQuad(quad);
    
                        else w.end((err, nquads) => {
                            if (err) reject(err);
    
                            else processor.fromRDF(nquads, def)
                                 .then(json => resolve(json))
                                 .catch(e => reject(e));
                        });
                    });
                }
                break;

            case 'object':
            case 'array':
                resolve(data);
                break;

            default:
                reject(new Error('Invalid JSON-LD or RDF definition'));
        }
    })

    // TODO normalize, compact
    .then(json => processor.flatten(json))

    .then(json => {
        // TODO put this code in urdf-core?
        json
            .filter(obj => obj['@graph'])
            .forEach(g => urdf.load(g['@graph'], g['@id']));

        urdf.load(json.filter(obj => !obj['@graph']));

        return true; // TODO deal with errors (none thrown from urdf-core)
    });
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
        let omegap = omega2.reduce((omega, mu2) => {
            let mu = urdf.merge(mu1, mu2);

            if (mu) omega.push(mu);

            return omega;
        }, []);

        if (opt && omegap.length === 0) omegap.push(mu1);
        
        return omega.concat(omegap);
    }, []);
}

/**
 * Sequentially evaluates a list of SPARQL query patterns.
 * 
 * @param {array} patterns array of pattern objects 
 * @param {string} gid graph identifier defining the scope of evaluation
 */
function evaluateAll(patterns, gid) {
    let main = patterns.filter(p => p.type != 'bind' && p.type != 'filter');
    let b = patterns.filter(p => p.type === 'bind');
    let f = patterns.filter(p => p.type === 'filter');

    let reordered = main.concat(b, f);

    return reordered.reduce((omega, p) => {
        return evaluate(p, omega, gid);
    }, [{}]);
}

/**
 * Evaluates a SPARQL query pattern and returns mappings.
 * 
 * @param {object} pattern the query pattern
 * @param {array} mappings current mappings
 * @param {string} gid graph identifier defining the scope of evaluation
 */
function evaluate(pattern, mappings, gid) {
    let omega = [];

    switch (pattern.type) {
        case 'group':
            omega = evaluateAll(pattern.patterns, gid);
            return merge(mappings, omega);

        case 'graph':
            if (pattern.name.startsWith('?')) {
                let n = name(pattern.name);
                omega = urdf.listGraphs()
                    .map(gid => {
                        let mu = { [n]: { type: 'uri', value: gid } };
                        return merge([mu], evaluateAll(pattern.patterns, gid));
                    })
                    .reduce((union, omega) => union.concat(omega));
            } else {
                omega = evaluateAll(pattern.patterns, pattern.name);
            }
            return merge(mappings, omega);

        case 'union':
            return pattern.patterns
                .map(p => evaluate(p, mappings, gid))
                .reduce((union, omega) => union.concat(omega));

        case 'optional':
            let g = {
                type: 'group',
                patterns: pattern.patterns
            };
            omega = evaluate(g, mappings, gid);
            return merge(mappings, omega, true);

        case 'bgp':
            let f = utils.frame(pattern);
            omega = urdf.query(f, gid);
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
                    try {
                        let n = name(pattern.variable);
                        let binding = {
                            [n]: utils.evaluate(pattern.expression, mu)
                        };
                        return urdf.merge(mu, binding);
                    } catch (e) {
                        if (e instanceof utils.EvaluationError) return mu;
                        else throw e;
                    }
                })
                .filter(mu => mu);

        case 'minus':
            omega = evaluateAll(pattern.patterns, gid);
            return mappings.filter(mu1 => {
                return !omega.some(mu2 => intersect(mu1, mu2));
            });

        case 'filter':
            // TODO optimize 'not/exists' filter: stop at first mapping
            switch (pattern.expression.operator) {
                case 'exists':
                    return mappings.filter(mu => {
                        let p = pattern.expression.args[0];
                        return evaluate(p, [mu], gid).length > 0;
                    });

                case 'notexists':
                    return mappings.filter(mu => {
                        let p = pattern.expression.args[0];
                        return evaluate(p, [mu], gid).length === 0;
                    });

                default:
                    return mappings.filter(mu => {
                        try {
                            let bool = utils.evaluate(pattern.expression, mu);
                            return utils.ebv(bool);
                        } catch (e) {
                            if (e instanceof utils.EvaluationError) return false;
                            else throw e;
                        }
                    });
            }

        default:
            throw new Error('Query pattern not supported or unknown');
    }
}

/**
 * Projects input mappings onto the given variables.
 * 
 * @param {array} vars a list of variables (starting with '?') or expressions with binding
 * @param {array} mappings a list of mappings
 */
function project(vars, mappings) {
    if (vars.some(v => v === '*')) return mappings;

    let names = vars.map(name);

    return mappings.map(mu1 => {
        let mu2 = {};

        for (let n in mu1) {
            if (names.indexOf(n) > -1) mu2[n] = mu1[n];
        }

        return mu2;
    });
}

/**
 * Modifies mappings as per query directives on the following aspects:
 *  - order
 *  - projection
 *  - distinct
 *  - reduced (ignored in this implementation)
 *  - offset
 *  - limit.
 * 
 * @param {object} query the AST of a SPARQL query
 * @param {array} mappings a list of mappings
 */
function modify(query, mappings) {
    let omega = Array.from(mappings);

    if (query.order) {
        omega.sort((mu1, mu2) => {
            return utils.compare(mu1, mu2, query.order);
        });
    }

    omega = project(query.variables, omega);

    if (query.distinct) {
        omega = omega.reduce((o, mu1) => {
            let by = query.variables.map(v => ({ expression: v }));

            // FIXME utils.compare() ignores datatype/lang
            let dup = o.some(mu2 => utils.compare(mu1, mu2, by) === 0);
            if (!dup) o.push(mu1);

            return o;
        }, []);
    }

    if (query.offset) omega = omega.slice(query.offset);

    if (query.limit) omega = omega.slice(0, query.limit);

    return omega;
}

/**
 * Rewrites in place a SPARQL query to get an equivalent, canonical form.
 * 
 * @param {object} query the AST of a SPARQL query
 */
function rewrite(query) {
    // move VALUES modifiers inside WHERE

    if (query.values) {
        query.where.push({
            type: 'values',
            values: query.values
        });

        query.values = undefined;
    }

    // replace inline expressions in SELECT with BIND patterns

    if (query.variables) {
        let names = query.variables.filter(v => typeof v === 'string');
        let exprs = query.variables.filter(v => typeof v === 'object');
    
        exprs.forEach(expr => {
            query.where.push({
                type: 'bind',
                variable: expr.variable,
                expression: expr.expression
            })
        });
    
        query.variables = names.concat(exprs.map(expr => expr.variable));
    }

    return query;
}

/**
 * Processes the input query and returns mappings as SPARQL JSON or a JSON-LD graph.
 * 
 * @param {string} sparql a SPARQL query as string
 */
function query(sparql) {
    return new Promise((resolve, reject) => {
        let ast = parser.parse(sparql);

       rewrite(ast);

        let mappings = evaluateAll(ast.where);

        switch (ast.queryType) {
            case 'SELECT':
                mappings = modify(ast, mappings);
                resolve(mappings);

            case 'ASK':
                // TODO stop after first mapping found
                resolve(mappings.length > 0);
            
            case 'DESCRIBE':
                // TODO use urdf.find

            case 'CONSTRUCT':
            default:
                reject(new Error('Not implemented'));
        }
    });
}

module.exports.size = urdf.size;
module.exports.findGraph = urdf.findGraph;
module.exports.find = find;
module.exports.clear = clear;
module.exports.load = load;
module.exports.query = query;