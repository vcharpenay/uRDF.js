'use strict';

// TODO derived from https://github.com/vcharpenay/STTL.js, avoid duplicates?

/**
 * Known prefixes.
 */
let prefixes = {};

/**
 * Transforms a N3.js representation of an RDF term to its JSON-LD form.
 * 
 * @param {string} the N3.js representation of the term
 */
function nodeOrValue(plain) {
	if (!plain || typeof plain != 'string') return '';
	
	let capture = null;
	if (capture = plain.match(/"([^]*)"(@.*)?(\^\^(.*))?/)) {
		let [str, lit, lang, suffix, datatype] = capture;
		return {
			'@value': lit,
			'@language': lang,
			'@type': datatype
		}
    } else if (plain.match(/^(([^:\/?#]+):)(\/\/([^\/?#]*))([^?#]*)(\?([^#]*))?(#(.*))?/) ||
               plain.match(/_:(.*)/)) {
		return {
			'@id': plain
		};
	} else if (capture = plain.match(/(\w*):(.*)/)) {
		let [str, prefix, name] = capture; 
		return {
			'@id': prefixes[prefix] + name
		};
	} else if (capture = plain.match(/\?(.*)/)) {
		let [str, name] = capture; 
		return {
			'@id': '_:' + name
		}
	} else {
		return {};
	}
}

module.exports.nodeOrValue = nodeOrValue;