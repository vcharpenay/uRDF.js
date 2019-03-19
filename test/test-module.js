const assert = require('assert');
const fs = require('fs');
const urdf = require('../src/urdf-module.js');

function load(f) {
    let data = JSON.parse(fs.readFileSync('test/data/' + f + '.json'));
    return urdf.clear().then(() => urdf.load(data));
}

function query(f) {
    let q = fs.readFileSync('test/queries/' + f + '.sparql', 'utf-8');

    let res = JSON.parse(fs.readFileSync('test/results/' + f + '.json'));
    if (typeof res !== 'array' && res.results) {
        res = res.results.bindings;
    }

    return urdf.query(q).then((m) => {
        let actual = new Set(m);
        let expected = new Set(res);
        assert.deepStrictEqual(actual, expected);
    });
}

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

    it('should correctly merge solution mappings from group patterns', () => {
        return load('lubm-s34')
        .then(() => query('assistant-degree'));
    });

    it('should correctly process bind patterns', () => {
        return load('lubm-s34')
        .then(() => query('person-name'));
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
});