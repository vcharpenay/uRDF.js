# µRDF Store

The µRDF store is an ECMAScript 5.1 implementation of an RDF store based on the
[JSON-LD](https://www.w3.org/TR/json-ld/) format. It is a prototype designed to
be run on micro-controller platforms using
[JerryScript](http://jerryscript.net/).

## Quickstart

```js
const urdf = require("urdf");

// flattened and normalized JSON-LD document
let jsonld = [
  {
    "@id": "http://www.Department0.University4.edu/AssistantProfessor1",
    "teacherOf": [
      { "@id": "http://www.Department0.University4.edu/GraduateCourse8" },
      { "@id": "http://www.Department0.University4.edu/Course8" }
    ],
    "@type": [ "Person"],
    "degreeFrom": [{ "@id": "http://www.University4.edu" }],
    "undergraduateDegreeFrom": [{ "@id": "http://www.University501.edu" }],
    "doctoralDegreeFrom": [{ "@id": "http://www.University4.edu" }]
  },
  { "@id": "Person" },
  { "@id": "http://www.Department0.University4.edu/Course8" },
  { "@id": "http://www.Department0.University4.edu/GraduateCourse8" },
  { "@id": "http://www.University4.edu" },
  { "@id": "http://www.University501.edu" }
];

urdf.context = {
  "@vocab": "http://swat.cse.lehigh.edu/onto/univ-bench.owl#"
};

assert.strictEqual(urdf.load(jsonld), true);

// flattened and normalized JSON-LD frame
var bindings = urdf.query([
  {
    "@id": "_:teacher",
    "teacherOf": [{ "@id": "http://www.Department0.University4.edu/Course8" }]
  }
]);

// bindings follow the JSON SPARQL results format
assert.deepStrictEqual(bindings, [
  {
    "teacher": {
      "type": "uri",
      "value": "http://www.Department0.University4.edu/AssistantProfessor1"
    }
  }
]);
```

All JSON-LD arguments must be
[flattened](https://www.w3.org/TR/json-ld-api/#flattening-algorithms) and
normalized (all properties for a node object, including `@type`, must be
an array).

This implementation can process all queries of the
[LUBM benchmark](http://swat.cse.lehigh.edu/projects/lubm/).

## Build

```
$ npm install
$ npm test
```