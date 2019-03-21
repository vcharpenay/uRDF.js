/**
 * Generates an HTML report based on the SPARQL 1.1 conformance test suite.
 * This script itself uses μRDF.js to drive tests...
 */
const assert = require('assert');
const fs = require('fs');
const jsonld = require('jsonld');
const n3 = require('n3');
const xml = require('xml-js');
const urdf = require('../../src/urdf-module.js');

function readTurtleFile(f, base) {
    return new Promise((resolve, reject) => {
        // TODO put that code in urdf.load()

        if (!fs.existsSync(f)) {
            resolve('');
            return;
            // reject(new Error('File not found.: ' + f));
        }

        let data = '';
        let input = fs.createReadStream(f),
            parser = new n3.StreamParser({ baseIRI: base }),
            writer = new n3.StreamWriter({ format: 'application/n-quads' });

        input.pipe(parser);
        parser.pipe(writer);

        writer.on('data', chunk => data += chunk);
        writer.on('error', e => reject(e));
        writer.on('end', () => {
            resolve(data);
        });
    })

    .then(data => jsonld.promises.fromRDF(data, { format: 'application/n-quads' }))
}

function readSparqlXml(f) {
    const _array = elem => elem instanceof Array ? elem : [elem];

    let data = fs.readFileSync(f, 'utf-8');
    let root = xml.xml2js(data, { compact: true });

    let results = root.sparql.results && root.sparql.results.result ?
                  _array(root.sparql.results.result) :
                  [];

    let bindings = results.map(res => {
        let bindings = _array(res.binding);

        let mu = {};
        bindings.forEach(b => {
            let name = b._attributes.name;
            let type = Object.keys(b).find(k => !k.startsWith('_'));
            let term = { type: type, value: b[type]._text };

            if (b[type]._attributes) {
                let attrs = b[type]._attributes;

                if (attrs['datatype']) term.datatype = attrs['datatype'];
                if (attrs['xml:lang']) term.lang = attrs['xml:lang'];
            }
            
            mu[name] = term;
        });

        return mu;
    });

    return Promise.resolve(bindings);
}

const testGroup = ' \
prefix mf: <http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#> \
prefix rdfs:	<http://www.w3.org/2000/01/rdf-schema#> \
select * where { \
  ?m a mf:Manifest . \
  { ?m rdfs:label ?name } union { ?m rdfs:comment ?name } \
}';

// TODO include test groups
// (simpler with property paths or list functions)
const tests = '\
prefix mf: <http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#> \
prefix qt:     <http://www.w3.org/2001/sw/DataAccess/tests/test-query#> \
prefix rdfs:	<http://www.w3.org/2000/01/rdf-schema#> \
select * where { \
    ?test a mf:QueryEvaluationTest ; \
          mf:name ?name ; \
          mf:action ?action ; \
          mf:result ?result . \
    ?action qt:query ?query ; \
            qt:data ?data . \
} \
';

const rootDir = 'test/conformance/sparql11-test-suite';

fs.readdirSync(rootDir)
.map(f => rootDir + '/' + f)
.filter(f => fs.statSync(f).isDirectory())
.filter(f => !f.endsWith('entailment')
          && !f.endsWith('property-path')
          && !f.endsWith('aggregates'))
.reduce((chain, dir) => {
    return chain
    .then(() => readTurtleFile(dir + '/manifest.ttl', 'file:' + dir + '/'))
    .then(json => urdf.load(json))
}, Promise.resolve())

.then(() => urdf.query(tests))

.then(tests => {
    let report = [];

    return tests.reduce((chain, t) => {
        if (!t.data.value.endsWith('.ttl')) {
            // TODO XML2JSON
            return chain;
        } else {
            let testReport = {
                location: t.query.value,
                name: t.name.value
            };
            report.push(testReport);

            return chain
            
            .then(() => urdf.clear())
            
            .then(() => readTurtleFile(t.data.value.replace('file:', ''), 'tag:'))

            .then(json => urdf.load(json))

            .then(() => {
                let q = fs.readFileSync(t.query.value.replace('file:', ''), 'utf-8');
                return urdf.query(q);
            })

            .then(actual => {
                return readSparqlXml(t.result.value.replace('file:', ''))
                .then(expected => [actual, expected]);
            })

            .then(([actual, expected]) => {
                if (actual) {
                    try {
                        assert.deepStrictEqual(new Set(actual), new Set(expected));
                        testReport.passed = true;
                    } catch (e) {
                        if (e instanceof assert.AssertionError) {
                            testReport.actual = actual;
                            testReport.expected = expected;
                            testReport.passed = false;
                        }
                        else {
                            throw e;
                        }
                    }
                }
            })

            .catch(e => {
                testReport.error = e.message;
                testReport.passed = false;
            });
        }
    }, Promise.resolve())

    .then(() => Promise.resolve(report));
})

.then(report => {
    fs.writeFileSync('test/conformance/report.json', JSON.stringify(report));
    return report;
})

.then(report => {
    let passed = report.filter(t => t.passed).length;
    let total = report.length;
    let ratio = Math.round(passed/total*1000)/10;
    let summary = passed + '/' + total + ' (' + ratio + '%) tests passed.';

    let rows = report
    .map(t => {
        return '<tr>' +
        '<td>' + t.name + '</td>' +
        '<td' + (t.passed ? ' class="passed"' : '') + '>' + t.passed + '</td>' +
        '<td>' + (t.error || '') + '</td>' +
        '</tr>';
    })
    .reduce((rows, row) => rows + row, '');

    let html = fs.readFileSync('test/conformance/report.template.html', 'utf-8')
    .replace('<!-- summary -->', summary)
    .replace('<!-- rows -->', rows);

    fs.writeFileSync('test/conformance/report.html', html);
});