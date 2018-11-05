const assert = require('assert');
const fs = require('fs');
const urdf = require('../src/uRDF.js');

function load(f) {
    let data = JSON.parse(fs.readFileSync('test/data/' + f));
    urdf.load(data);
}

function query(f) {
    let q = JSON.parse(fs.readFileSync('test/queries/' + f));
    let res = JSON.parse(fs.readFileSync('test/results/' + f));

    return [new Set(urdf.query(q)), new Set(res)];
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
        let [actual, expected] = query('unit.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process a single triple pattern with @type', () => {
        load('thing.json');
        let [actual, expected] = query('type.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process a pattern starting with a variable', () => {
        load('thing.json');
        let [actual, expected] = query('properties.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should exclude incompatible mappings in joins', () => {
        load('thing.json');
        let [actual, expected] = query('no-property.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should join compatible mappings (subject-subject)', () => {
        load('lubm-s34.json');
        let [actual, expected] = query('curriculum.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should join compatible mappings (subject-object)', () => {
        load('thing.json');
        let [actual, expected] = query('celsius-properties.json');
        assert.deepStrictEqual(actual, expected);
    });
});