const util = require('util')

// ***** UNDER CONSTRUCTION !!!! *****

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mapObj(obj,fn) {
    if (obj._encrypted) return await fn(obj._encrypted);
    if (obj._encrypt) return {
        "_encrypted": await fn(obj._encrypt)
    };
    const mapped = await Promise.all(Object.entries(obj).map(async e => {
        e[1] = await mapDeep(e[1], fn);
        return e;
    }));
    return mapped.reduce((acc, e) => {
        acc[e[0]] = e[1];
        return acc;
    }, {});
}  

const mapDeep = async (obj, fn) =>
  Array.isArray(obj)
    ? await Promise.all(obj.map(val => mapDeep(val, fn)))
    : typeof obj === 'object'
    ? await mapObj(obj, fn)
    : obj;

const obj = {
    att1: "att1",
    nested: {
        att2: "att2",
        password: {
            _encrypt: {
                value: "my super secret"
            }
        },
        att3: "att3",
        nested2: {
            _encrypt: {
                nested: {
                    structure: "any value"
                },
                att4: "att4"
            }
        }
    }
}
console.log(util.inspect(obj, {showHidden: false, depth: null, colors: true}))

async function run () {

    const mappedObj = await mapDeep(obj, async (obj) => {
        // async stuff: e.g. encryption
        await sleep(100)
        return {
                id: "key ID",
                iv: "initalization vector",
                value: obj.value || obj
        };
    });
    
    console.log(util.inspect(mappedObj, {showHidden: false, depth: null, colors: true}))

    const restoredObj = await mapDeep(mappedObj, async (obj) => {
        // async stuff: e.g. encryption
        await sleep(100)
        return obj.value;
    });
    
    console.log(util.inspect(restoredObj, {showHidden: false, depth: null, colors: true}))
    
}

run();


