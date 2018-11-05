const assert = require('assert');
const fs = require('fs');
const urdf = require('../src/uRDF.js');

function load(f) {
    let data = JSON.parse(fs.readFileSync('test/data/' + f));
    urdf.load(data);
}

function query(f) {
    return JSON.parse(fs.readFileSync('test/queries/' + f));
}

before(() => {
    urdf.clear();
});

describe('urdf.clear()', () => {
    it('should delete all nodes', () => {
        assert.strictEqual(urdf.size(), 0);
        load('thing.json');
        urdf.clear();
        assert.strictEqual(urdf.size(), 0);
    });
});

describe('urdf.size()', () => {
    it('should return the correct number of triples', () => {
        fs.readdirSync('test/data')
          .filter(f => /lubm-s\d+\.json/.test(f))
          .forEach((f) => {
              load(f);
              let size = Number.parseInt(f.match(/\d+/)[0]);
              assert.strictEqual(urdf.size(), size);
              urdf.clear();
          });
    });
});

describe('urdf.find()', () => {
    const uri = 'http://www.Department0.University4.edu/AssistantProfessor1';

    it('should return the correct node', () => {
        load('lubm-s8.json');
        let n = urdf.find(uri);
        assert.ok(n);
        assert.strictEqual(n['@id'], uri);
    });

    it('should return null if no node found', () => {
        load('lubm-s8.json');
        assert.strictEqual(urdf.find('tag:notfound'), null);
    });
});

describe('urdf.query()', ()=> {
    it('should correctly process a single triple pattern', () => {
        load('thing.json');
        let q = query('unit.json');
        let res = urdf.query(q);
        assert.deepStrictEqual(res, [{
            'unit': {
                '@id': 'http://data.nasa.gov/qudt/owl/unit#DegreeCelsius'
            }
        }]);
    });

    it('should correctly process a single triple pattern with @type', () => {
        load('thing.json');
        let q = query('type.json');
        let res = urdf.query(q);
        assert.deepStrictEqual(new Set(res), new Set([{
            't': {
                '@id': 'http://www.w3.org/ns/sosa/Sensor'
            }
        }, {
            't': {
                '@id': 'https://w3id.org/saref#TemperatureSensor'
            }
        }]));
    });

    it('should correctly exclude incompatible mappings in joins', () => {
        load('thing.json');
        let q = query('properties.json');
        let res = urdf.query(q);
        assert.strictEqual(res.length, 0);
    });
});