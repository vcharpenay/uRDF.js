# µRDF Store

µRDF.js is a JavaScript implementation of an RDF store with SPARQL query
processing. At its core is an ECMAScript 5.1 implementation based on the
[JSON-LD](https://www.w3.org/TR/json-ld/) format, designed to be run on
micro-controller platforms using [JerryScript](http://jerryscript.net/).

## Quickstart

### Online Demo

The easiest way to start with µRDF.js is to try its
[online demo](https://vcharpenay.github.io/uRDF.js/).

### Command-Line Interface

A CLI is also available (after building the project, see below).

```sh
npm run urdf query <filename>
```

### Build

```sh
$ npm install
$ npm test
$ npm run browserify # generates src/urdf-browser.js (optional)
```

### API

The following snippet shows how the main API calls work.

```js
const assert = require('assert');
const urdf = require('urdf');

// some JSON-LD definition (LUBM SPARQL benchmark)
const data = {
    "@context": {
        "@vocab": "http://swat.cse.lehigh.edu/onto/univ-bench.owl#"
    },
    "@id": "http://www.Department0.University4.edu/AssistantProfessor1",
    "@type": "Person",
    "teacherOf": [
        { "@id": "http://www.Department0.University4.edu/GraduateCourse8" },
        { "@id": "http://www.Department0.University4.edu/Course8" }
    ],
    "degreeFrom": { "@id": "http://www.University4.edu" },
    "undergraduateDegreeFrom": { "@id": "http://www.University501.edu" },
    "doctoralDegreeFrom": { "@id": "http://www.University4.edu" }
};

// a query (LUBM SPARQL benchmark)
const queryString = '\
prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#>\
select ?teacher where {\
    ?teacher ub:teacherOf <http://www.Department0.University4.edu/Course8> .\
}';

// a query with a custom JavaScript function
const customQueryString = '\
prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#>\
select (<javascript:String.prototype.charAt>(?teacher, 11) as ?idx)  where {\
?teacher ub:teacherOf <http://www.Department0.University4.edu/Course8> .\
}';

// function arguments are passed as plain JavaScript values;
// return value can either be another plain value or a SPARQL JSON object
urdf.register('javascript:String.prototype.charAt', (str, idx) => str.charAt(idx));

// functions for RDF list management are available:
//  - <javascript:urdf.indexOf>(?list, ?element)
//  - <javascript:urdf.lastIndexOf>(?list, ?element)
//  - <javascript:urdf.valueAt>(?list, ?index)
//  - <javascript:urdf.length>(?list)

// all API calls are Promise-based
Promise.resolve()

.then(() => urdf.load(data))

.then(actual => assert.strictEqual(actual, true))

.then(() => urdf.clear())

.then(() => {
    const dataString = JSON.stringify(data);
    const opts = { format: 'application/ld+json' };
    
    // when data is passed as a string, a media type must be given;
    // default: Turtle (see N3.js library)
    return urdf.load(dataString, opts);
})

.then(actual => assert.strictEqual(actual, true))

.then(() => urdf.query(queryString))

.then(actual => assert.deepStrictEqual(actual, [
    // solutions follow the JSON SPARQL results format;
    // see http://www.w3.org/TR/sparql11-results-json/
    {
        "teacher": {
            // the format was extended to ease RDF list management:
            // lists are returned as arrays of SPARQL results of the form
            // { "type": "list", "value": [...] }
            "type": "uri",
            "value": "http://www.Department0.University4.edu/AssistantProfessor1"
        }
    }
]))

.then(() => urdf.query(customQueryString))

.then(actual => assert.deepStrictEqual(actual, [
    {
        "idx": {
            "type": "literal",
            "value": "D"
        }
    }
]));
```

The SPARQL engine of µRDF.js can process all queries of the
[LUBM benchmark](http://swat.cse.lehigh.edu/projects/lubm/).