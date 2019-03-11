'use strict';

const fs = require('fs');

const utils = require('./utils.js');
const urdf = eval(fs.readFileSync('src/urdf.js', 'utf-8')); // FIXME absolute path?

const parser = new require('sparqljs').Parser();

function load(json) {
    // TODO normalize, compact
    return urdf.load(json);
}

function query(sparql) {
    let ast = parser.parse(sparql);

    // TODO process returned bindings to 
    let pattern = ast.where[0];
    let f = frame(pattern);
    return urdf.query(f);
}

function frame(bgp) {
    return bgp.triples.reduce((f, tp) => {
        let s = utils.nodeOrValue(tp.subject);
        let n = f.find(n => n['@id'] === s['@id']);
        if (!n) {
            n = s;
            f.push(n);
        }

        let p = (tp.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') ?
                '@type' : tp.predicate;
        if (!n[p]) n[p] = [];

        let o = utils.nodeOrValue(tp.object);
        if (p === '@type') o = o['@id'];
        n[p].push(o);

        return f;
    }, []);
}

module.exports.size = urdf.size;
module.exports.clear = urdf.clear;
module.exports.load = load;
module.exports.query = query;