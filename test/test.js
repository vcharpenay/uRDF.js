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

describe('urdf.size()', () => {
    it('should return the correct number of triples', () => {
        load('lubm-s8.json');
        assert.strictEqual(urdf.size(), 8);
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
    it('should return the correct unit of measurement (°C)', () => {
        load('thing.json');
        let q = query('unit.json');
        let res = urdf.query(q);
        assert.strictEqual(res.length, 1);
        assert.deepEqual(res[0]['unit'], {
            '@id': 'http://data.nasa.gov/qudt/owl/unit#DegreeCelsius'
        });
    });
});