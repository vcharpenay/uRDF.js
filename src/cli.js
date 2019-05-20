const fs = require('fs');
const arg = require('arg');
const urdf = require('./urdf-module.js');

const spec = {
    '--format': String,
    '--output': String,
    '-f': '--format',
    '-o': '--output'
};

const help = 'Usage: urdf <cmd>\n\
where <cmd> is one of:\n\
\tquery [-f <format=csv>] <filename>';

function csv(arr) {
    return arr.reduce((l, elem, idx) => {
        return l + elem + ((idx < arr.length - 1) ? ',' : '');
    }, '');
}

let [cmd, ...args] = process.argv.slice(2);

if (cmd) {
    switch (cmd) {
        case 'load':
            return;
        
        case 'query':
            let parsed = arg(spec, { argv: args });

            let f = parsed._.pop();
            let q = fs.readFileSync(f, 'utf-8');

            urdf.query(q).then(res => {
                if (res.length > 0) {
                    let vars = Object.keys(res[0]);
    
                    console.log(csv(vars.map(v => '?' + v)));

                    res.forEach(b => {
                        console.log(csv(vars.map(v => b[v].value)));
                    });
                } else {
                    console.log('No result.');
                }
            });

            return;
    }
}

console.log(help);