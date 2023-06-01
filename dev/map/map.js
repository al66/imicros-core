const map = require("../lib/map");
const util = require("util");

const template = {
    "This is a key": "this is a string value",
    "numbers": {
        "template": 10,
        "data": "{{number}}"
    },
    "booleans": {
        "template": false,
        "data": "{{boolean}}"
    },
    "deep" : {
        "level A": {
            "level B": {
                "x": "{{arrays.number}}",
                "y": "{{arrays.string}}",
                "z": "{{arrays.object}}"
            }
        },
        "{{keys.a}}": "deep key"
    },
    "array": ["{{number}}", "{{arrays.number}}"],
    "path": "{{keys}}",
    "{{keys.a}}": "any",
    "{{keys.b}}": "missing key",
    "missing value": "{{any}}"
};

const data = {
    keys: {
        a: "test"
    },
    number: 10,
    boolean: true,
    arrays: {
        number: [1,2,3,4,5,],
        string: ["hello", "world"],
        object: [
          { a: 1, b: "v", c: "3" },
          { a: 2, b: "s", c: "4" }
        ]
    }
};

let result = map(template, data);
console.log(util.inspect(template, false, 99, true));
console.log(util.inspect(data, false, 99, true));
console.log(util.inspect(result, false, 99, true));
