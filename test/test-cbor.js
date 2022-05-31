const assert = require('assert');
const fs = require('fs');
const cbor = require('../src/cbor.js');

let hex = fs.readFileSync('data/lubm-s8.hex', 'utf-8');
let bin = Buffer.from(hex, 'hex');

// data is 339 bytes

// RDF C struct would be
//   8 (nb. triples) * 3 (triple size) * 4 (pointer size in 32 bit arch) = 96
// + 212 (nb. UTF characters in URIs) + 7 (nb. URIs) * 2 (string pointer + next pointer) * 4 (pointer size) + 7 (length of each URI)
// = 357 bytes

// (URIs could be stored in a prefix tree)

// for 34 triples: 1097 bytes vs. 408 + 741 + 162 = 1311

// for n triples, i nodes with at most k out-degree (regardless of string length):
// i * k * 6 (major byte, length byte, 2 bytes for key, 2 bytes for value)
// vs.
// (n = i * k) * 12 + i * 9

// ratio: (i * (12k + 9)) / 6ik = 3/2k + 2

let nbLoops = 100000000;

let before = Date.now();
for (let i = 0; i < nbLoops; i++) cbor.read(bin, 0);
let after = Date.now();

console.log(`${after - before} ms`);

// simulates an RDF C struct
let struct = new Uint8Array(34 * 3 * 4);
struct.forEach((v, i) => struct[i] = Math.round(Math.random() * 255));

before = Date.now();
for (let i = 0, cursor = 0; i < nbLoops; i++) cursor += 12;
after = Date.now();

console.log(`${after - before} ms`);
