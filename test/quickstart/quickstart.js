const assert = require('assert');
const urdf = require('../../src/urdf-module.js');

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