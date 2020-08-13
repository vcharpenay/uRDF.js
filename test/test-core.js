const assert = require('assert');
const fs = require('fs');
const urdf = require('../src/urdf.js');

const store = new urdf.Store();

function load(f, id) {
    let data = JSON.parse(fs.readFileSync('test/data/' + f));
    store.clear(id);
    store.load(data, id);
}

function query(f, id) {
    let q = JSON.parse(fs.readFileSync('test/queries/' + f));

    let res = JSON.parse(fs.readFileSync('test/results/' + f));
    if (typeof res !== 'array' && res.results) {
        res = res.results.bindings;
    }

    return [new Set(store.query(q, id)), new Set(res)];
}

before(() => {
    store.clear();
});

describe('urdf.Store.findGraph()', () => {
    it('should return a named graph only if identifier given', () => {
        let tag1 = 'tag:things.json';
        load('thing.json', tag1);

        let tag2 = 'tag:lubm-s34.json';
        load('lubm-s34.json', tag2);

        let g1 = store.findGraph(tag1);
        let g2 = store.findGraph(tag2);
        assert.notDeepStrictEqual(g1, g2);
    });
});

describe('urdf.Store.clear()', () => {
    it('should delete all nodes', () => {
        load('thing.json');
        store.clear();
        assert.strictEqual(store.size(), 0);
    });
    
    it('should clear named graph only if identifier given', () => {
        let tag1 = 'tag:things.json';
        load('thing.json', tag1);

        let tag2 = 'tag:lubm-s34.json';
        load('lubm-s34.json', tag2);

        store.clear(tag1);

        assert.strictEqual(store.size(), 34);
    });
});

describe('urdf.Store.size()', () => {
    it('should return the correct number of triples', () => {
        fs.readdirSync('test/data')
          .filter(f => /lubm-s\d+\.json/.test(f))
          .forEach((f) => {
              load(f);
              let size = Number.parseInt(f.match(/\d+/)[0]);
              assert.strictEqual(store.size(), size);
              store.clear();
          });
    });

    it('should return the total number of triples if named graphs exist', () => {
        let size = fs.readdirSync('test/data')
          .filter(f => /lubm-s\d+\.json/.test(f))
          .reduce((size, f) => {
              load(f, 'tag:' + f);
              return size += Number.parseInt(f.match(/\d+/)[0]);
          }, 0);

        assert.strictEqual(store.size(), size);
    });

    it('should return the number of triples for named graph only if identifier given', () => {
        let sizes = fs.readdirSync('test/data')
          .filter(f => /lubm-s\d+\.json/.test(f))
          .reduce((sizes, f) => {
              let tag = 'tag:' + f;
              load(f, tag);
              sizes[tag] = Number.parseInt(f.match(/\d+/)[0]);
              return sizes;
          }, {});

        for (let id in sizes) {
            assert.strictEqual(store.size(id), sizes[id]);
        }
    });
});

describe('urdf.Store.find()', () => {
    const uri = 'http://www.Department0.University4.edu/AssistantProfessor1';

    it('should return the correct node', () => {
        load('lubm-s8.json');
        let n = store.find(uri);
        assert.ok(n);
        assert.strictEqual(n['@id'], uri);
    });

    it('should return null if no node found', () => {
        load('lubm-s8.json');
        assert.strictEqual(store.find('tag:notfound'), null);
    });

    it('should return null if node not found in given graph', () => {
        let tag1 = 'tag:lubm-s8.json';
        load('lubm-s8.json', tag1);

        let tag2 = 'tag:thing.json';
        load('thing.json', tag2);

        let id = 'http://example.org/sensor1';
        assert.strictEqual(store.find(id, tag1), null);
        assert.ok(store.find(id, tag2));
    });
});

describe('urdf.Store.query()', ()=> {
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

    it('should correctly process a single triple pattern with non-existing @type', () => {
        load('thing.json');
        let [actual, expected] = query('no-actuator.json');
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

    it('should exclude incompatible mappings in joins', () => {
        load('thing.json');
        let [actual, expected] = query('no-property.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should silently ignore non-existing subject-object joins', () => {
        load('thing.json');
        let [actual, expected] = query('state-class-missing.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process graph-shaped BGPs', () => {
        load('thing.json');
        let [actual, expected] = query('cmd-property.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process literals', () => {
        load('thing.json');
        let [actual, expected] = query('current-value.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly bind literals to variables', () => {
        load('thing.json');
        let [actual, expected] = query('unknown-value.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process triple patterns with unbound predicate', () => {
        load('thing.json');
        let [actual, expected] = query('thing-frame.json');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process a query within a named graph', () => {
        let tag1 = 'tag:lubm-s34.json';
        load('lubm-s34.json', tag1);

        let tag2 = 'tag:thing.json';
        load('thing.json', tag2);

        let [actual, expected] = query('curriculum.json', tag1);
        assert.deepStrictEqual(actual, expected);

        [actual, expected] = query('curriculum.json', tag2);
        assert.deepStrictEqual(actual, new Set());

        [actual, expected] = query('celsius-properties.json', tag1);
        assert.deepStrictEqual(actual, new Set());

        [actual, expected] = query('celsius-properties.json', tag2);
        assert.deepStrictEqual(actual, expected);
    });
});

describe('urdf.Store', () => {
    it('should correctly process all LUBM benchmark queries', () => {
        load('lubm-inf.json');
        let report = [];
        for (var i = 1; i <= 14; i++) {
            let [actual, expected] = query('lubm-q' + i + '.json');
            try {
                assert.deepStrictEqual(actual, expected);
            } catch (e) {
                if (e instanceof assert.AssertionError) {
                    report[i] = e;
                } else {
                    throw e;
                }
            }
        }
        assert.strictEqual(report.filter(e => e).length, 0);
    });
});