const n3 = require('n3');
const jsonld = require('jsonld');

const processor = jsonld.promises;

function parse(dataString, opts) {
    return new Promise((resolve, reject) => {
        if (opts && opts.format === 'application/ld+json') {
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

function serialize(data) {
    // TODO
}

module.exports.parse = parse;
module.exports.serialize = serialize;