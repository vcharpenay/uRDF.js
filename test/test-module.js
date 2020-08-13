const assert = require('assert');
const fs = require('fs');
const urdf = require('../src/urdf-module.js');

function load(f, append) {
    let data = JSON.parse(fs.readFileSync('test/data/' + f + '.json'));
    return (append ? Promise.resolve() : urdf.clear())
    .then(() => urdf.load(data));
}

function query(f, ordered) {
    let q = fs.readFileSync('test/queries/' + f + '.sparql', 'utf-8');

    let expected = JSON.parse(fs.readFileSync('test/results/' + f + '.json'));
    if (typeof expected !== 'array' && expected.results) {
        expected = expected.results.bindings;
    }

    return urdf.query(q).then((actual) => {
        if (expected instanceof Array && !ordered) expected = new Set(expected);
        if (actual instanceof Array && !ordered) actual = new Set(actual);

        assert.deepStrictEqual(actual, expected);
    });
}

describe('urdf.load()', () => {
    const id = 'https://w3id.org/saref#TemperatureSensor';
    const gid = 'tag:thing.json';

    it('should correctly process arbitrary JSON-LD', () => {
        return load('thing-compact')
        .then(() => urdf.find(id));
    });

    it('should correctly process blank nodes', () => {
        return load('thing')
        .then(() => load('thing-bnode', true))
        .then(() => query('bnode-collision'));
    });

    it('should correctly process JSON-LD in a named graph', () => {
        return load('thing-graph')
        .then(() => urdf.find(id, gid))
        .then(() => urdf.find(id))
        .then(() => assert.fail())
        .catch(() => true);
    });

    it('should accept input RDF if Turtle or N-Triples', () => {
        let data = fs.readFileSync('test/data/thing-turtle.ttl', 'utf-8');
        return urdf.load(data, { format: 'text/turtle' })
        .then(() => urdf.find(id));
    });

    it('should correctly process named graphs from N-Quads or TriG', () => {
        let data = fs.readFileSync('test/data/thing-graph.trig', 'utf-8');
        return urdf.load(data, { format: 'application/trig' })
        .then(() => urdf.find(id, gid))
        .then(() => urdf.find(id))
        .then(() => assert.fail())
        .catch(() => true);
    });
});

describe('urdf.loadFrom()', () => {
    it('should correctly load remote JSON-LD content', () => {
        const id = 'https://www.vcharpenay.link/#me';
        const uri = 'http://www.vcharpenay.link/vcharpenay.jsonld';

        return urdf.loadFrom(uri)
        .then(() => urdf.find(id, uri))
    });

    it('should correctly load remote content in Turtle', () => {
        const id = 'http://www.w3.org/ns/sosa/Sensor';
        const uri = 'http://www.w3.org/ns/sosa/sosa.ttl';

        return urdf.loadFrom(uri)
        .then(() => urdf.find(id, uri))
    });

    it('should correctly process relative URIs in remote JSON-LD content', () => {
        // TODO
    });

    it('should correctly process relative URIs in remote Turtle content', () => {
        // TODO
    });
});

describe('urdf.query()', () => {
    it('should correctly parse and process all LUBM benchmark queries', () => {
        return load('lubm-inf')
        .then(() => {
            let report = [];
            
            for (var i = 1; i <= 14; i++) report.push(query('lubm-q' + i));

            return Promise.all(report);
        });
    });

    it('should correctly process logical operators in filter', () => {
        return load('thing')
        .then(() => query('property-filter'));
    });

    it('should correctly process arithmetic operators in filter', () => {
        return load('thing')
        .then(() => query('property-value-filter'));
    });

    it('should correctly process functions on strings in filter', () => {
        return load('lubm-s34')
        .then(() => query('graduate-number'));
    });

    it('should correctly process functions on numerics in filter', () => {
        return load('thing')
        .then(() => query('property-value-math'));
    });

    it('should correctly process functions on dates and times in filter', () => {
        return load('thing')
        .then(() => query('year-zero'));
    });

    it('should correctly process constructor functions in filter', () => {
        return load('thing')
        .then(() => query('property-value-cast'));
    });

    it('should correctly process the bound function', () => {
        return load('lubm-s34')
        .then(() => query('bound-person'));
    });

    it('should correctly merge solution mappings from group patterns', () => {
        return load('lubm-s34')
        .then(() => query('assistant-degree'));
    });

    it('should correctly process bind patterns', () => {
        return load('lubm-s34')
        .then(() => query('person-name'));
    });

    it('should correctly process strbefore/strafter in bind pattern', () => {
        return load('lubm-s34')
        .then(() => query('univ-number'));
    });

    it('should correctly process union patterns', () => {
        return load('lubm-s34')
        .then(() => query('all-persons'));
    });

    it('should correctly process optional patterns', () => {
        return load('thing')
        .then(() => query('opt-property-value'));
    });

    it('should correctly process inline value patterns', () => {
        return load('lubm-s34')
        .then(() => query('type-univ-pairs'));
    });

    it('should correctly process minus patterns', () => {
        return load('lubm-s34')
        .then(() => query('minus-degrees'));
    });

    it('should correctly process filters with sub-patterns', () => {
        return load('lubm-s34')
        .then(() => query('filter-degrees'));
    });

    it('should correctly perform simple select projection', () => {
        return load('thing')
        .then(() => query('cmd-property-proj'));
    });

    it('should correctly evaluate select expressions', () => {
        return load('thing')
        .then(() => query('property-value-expr'));
    });

    it('should correctly answer ask queries', () => {
        return load('lubm-s34')
        .then(() => query('is-doctor'));
    });

    it('should silently ignore bind patterns with unknown bindings', () => {
        return urdf.clear()
        .then(() => query('bind-unknown'));
    });

    it('should correctly process pattern in named graph', () => {
        return load('thing-graph')
        .then(() => query('sensor-graph'));
    });

    it('should correctly process named graphs as variable', () => {
        return load('thing-graph')
        .then(() => query('sensor-unknown-graph'));
    });

    it('should correctly select an ordered subset of the solutions', () => {
        return load('lubm-inf')
        .then(() => query('some-persons', true));
    });

    it('should correctly return distinct solutions only', () => {
        return load('lubm-inf')
        .then(() => query('distinct-courses'));
    });

    it('should correctly process custom functions', () => {
        urdf.register('javascript:Math.pow', (base, exp) =>  Math.pow(base, exp));

        return load('thing')
        .then(() => query('property-value-pow'));
    });

    it('should correctly process list functions', () => {
        return load('lubm-list')
        .then(() => query('ordered-author-list'));
    });

    it('should correctly process list functions for literal lists', () => {
        return load('lubm-list')
        .then(() => query('publication-keyword-list'));
    });

    it('should correctly process list functions with joins', () => {
        return load('lubm-list')
        .then(() => query('publication-author-class'));
    });

    it('should correctly process unsafe filter inside an optional pattern', () => {
        return load('thing')
        .then(() => query('unsafe-sensor-filter'));
    });

    it('should correctly process safe filter inside an optional pattern', () => {
        return load('thing')
        .then(() => query('safe-sensor-filter'));
    });

    it('should correctly limit query evaluation to the input dataset', () => {
        return load('thing-graph')
        .then(() => query('sensor-dataset'));
    });

    it('should try to fetch remote graph if not present before querying', () => {
        return query('remote-dataset');
    });
});