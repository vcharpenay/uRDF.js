const n3 = require('n3');
const jsonld = require('jsonld');
const fetch = require('node-fetch');

const processor = jsonld.promises;

/**
 * Parses data in a given serialization format and returns
 * JSON-LD definitions.
 * 
 * @param {string} dataString JSON-LD definitions or RDF triples
 * serialialized as a string
 * @param {object} opts options as an object (passed to N3.js)
 */
function parse(dataString, opts) {
    return new Promise((resolve, reject) => {
        if (opts && (!opts.format || opts.format.startsWith('application/ld+json'))) {
            try {
                resolve(JSON.parse(dataString));
            } catch (e) {
                reject(e);
            }
        } else {
            const def = { format: 'application/n-quads' };

            let p = new n3.Parser(opts);
            let w = new n3.Writer(def);

            // TODO use stream API...?
            p.parse(dataString, (err, quad) => {
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
    });
}

/**
 * Fetches and parses data from a remote location, then
 * returns JSON-LD definitions.
 * 
 * @param {string} uri 
 */
function parseFrom(uri) {
    let opts = { baseIRI: uri };

    return fetch(uri, {
        headers: { 'Accept': 'application/ld+json' },
        redirect: 'follow'
    })

    .then(res => {
        if (res.ok) {
            if (res.headers.has('Content-Type')) {
                opts.format = res.headers.get('Content-Type');
            }

            return res.text();
        } else {
            // silently ignore failed attempt
            console.error(res);
        }
    })

    .then(data => parse(data, opts))

    .catch(e => console.error(e));
}

function serialize(data) {
    // TODO
}

module.exports.parse = parse;
module.exports.parseFrom = parseFrom;
module.exports.serialize = serialize;