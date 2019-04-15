# µRDF Store

µRDF.js is a JavaScript implementation of an RDF store with SPARQL query
processing. At its core is an ECMAScript 5.1 implementation based on the
[JSON-LD](https://www.w3.org/TR/json-ld/) format, designed to be run on
micro-controller platforms using [JerryScript](http://jerryscript.net/).

## Quickstart

### Online Demo

The easiest way to start with µRDF.js is to try its
[online demo](https://vcharpenay.github.io/uRDF.js/).

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
const urdf = require("urdf");

// some JSON-LD definition (LUBM SPARQL benchmark)
const data = {
  "@context": {
    "@vocab": "http://swat.cse.lehigh.edu/onto/univ-bench.owl#"
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

assert.strictEqual(urdf.load(data), true);

urdf.clear();

const dataString = JSON.stringify(data);
const opts = { format: 'application/ld+json' };

// when data is passed as a string, a media type must be given;
// default: Turtle (see N3.js library)
assert.strictEqual(urdf.load(dataString, opts), true);

// a query (LUBM SPARQL benchmark)
const queryString = '\
prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#>\
select ?teacher where {\
  ?teacher ub:teacherOf <http://www.Department0.University4.edu/Course8> .\
}';

// solutions follow the JSON SPARQL results format;
// see http://www.w3.org/TR/sparql11-results-json/
assert.deepStrictEqual(urdf.query(queryString), [
  {
    "teacher": {
      "type": "uri",
      "value": "http://www.Department0.University4.edu/AssistantProfessor1"
    }
  }
]);

// function arguments are passed as plain JavaScript values;
// return value can either be another plain value or a SPARQL JSON object
urdf.register('javascript:String.prototype.charAt', (str, idx) => str.charAt(idx));

const customQueryString = '\
prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#>\
select (<javascript:String.prototype.charAt>(?teacher, 11) as ?idx)  where {\
  ?teacher ub:teacherOf <http://www.Department0.University4.edu/Course8> .\
}';

assert.deepStrictEqual(urdf.query(customQueryString), [
  {
    "idx": {
      "type": "literal",
      "value": "D"
    }
  }
]);
```

The SPARQL engine of µRDF.js can process all queries of the
[LUBM benchmark](http://swat.cse.lehigh.edu/projects/lubm/).