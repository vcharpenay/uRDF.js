const assert = require('assert');
const fs = require('fs');
const urdf = require('../src/urdf-module.js');

function load(f) {
    let data = JSON.parse(fs.readFileSync('test/data/' + f + '.json'));
    urdf.clear();
    urdf.load(data);
}

function query(f) {
    let q = fs.readFileSync('test/queries/' + f + '.sparql', 'utf-8');

    let res = JSON.parse(fs.readFileSync('test/results/' + f + '.json'));
    if (typeof res !== 'array' && res.results) {
        res = res.results.bindings;
    }

    return [new Set(urdf.query(q)), new Set(res)];
}

describe('urdf.query()', () => {
    it('should correctly parse and process all LUBM benchmark queries', () => {
        load('lubm-inf');
        let report = [];
        for (var i = 1; i <= 14; i++) {
            let [actual, expected] = query('lubm-q' + i);
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

    it('should correctly process logical operators in filter', () => {
        load('thing');
        let [actual, expected] = query('property-filter');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process arithmetic operators in filter', () => {
        load('thing');
        let [actual, expected] = query('property-value-filter');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly process functions on strings in filter', () => {
        load('lubm-s34');
        let [actual, expected] = query('graduate-number');
        assert.deepStrictEqual(actual, expected);
    });

    it('should correctly merge solution mappings from group patterns', () => {
        load('lubm-s34');
        let [actual, expected] = query('assistant-degree');
        assert.deepStrictEqual(actual, expected);
    });
});