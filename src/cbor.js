/**
 * Reads a single item from a CBOR buffer (as UInt8Array), starting from the given cursor.
 * 
 * See https://datatracker.ietf.org/doc/html/rfc8949#appendix-C
 */
function read(bin, cursor) {
    let initialByte = bin[cursor++];

    let additionalInfo = initialByte & 0b11111;

    let argument = 0;
    switch (additionalInfo) {
        case 24:
        case 25:
        case 26:
        case 27:
            let nbBytes = additionalInfo - 23;
            for (let i = 0; i < nbBytes; i++) argument += bin[cursor++] << (i * 8);
            break;

        case 28:
        case 29:
        case 30:
            throw new Error('not well-formed CBOR');

        case 31:
            // TODO
            break;

        default: // < 24
            argument = additionalInfo;
    }

    let majorType = initialByte >> 5;
    switch (majorType) {
        case 0: // positive int
        case 1: // negative int
        case 7: // float (or simple value)
            break;

        case 2: // byte string
        case 3: // UTF string
            cursor += argument;
            break;

        case 4: // array
            for (let i = 0; i < argument; i++) cursor = read(bin, cursor);
            break;
        case 5: // map
            for (let i = 0; i < 2 * argument; i++) cursor = read(bin, cursor);
            break;

        case 6: // tagged item
            // TODO
            break;
    }

    return cursor;
}

/**
 * Matches a CBOR(-LD) frame against a CBOR buffer (as UInt8Array), starting from the given cursor.
 */
function match(bin, cursor, frame) {

}

// TODO CBORBuffer prototype?
// object state: current item at cursor

// TODO assume all keys in a map are ordered (for early stop)

module.exports.read = read;
module.exports.match = match;