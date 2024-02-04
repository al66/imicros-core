"use strict";
const { PassThrough, Readable, Writable } = require("stream");

const store = {};

function put(objectName, any) {
    store[objectName] = any;
}

function get(objectName) {
    return store[objectName];
}

function getStore() {
    return store;
}
class ReadableObjectStream extends Readable {
    constructor(obj) {
        super();
        if (typeof obj === "object") {
            this.str = JSON.stringify(obj);
        } else if (typeof obj === "string") {
            this.str = obj;
        } else {
            this.str = "";
        }
        this.sent = false;
    }

    _read() {
        if (!this.sent) {
            this.push(Buffer.from(this.str));
            this.sent = true;
        }
        else {
            this.push(null);
        }
    }
}

class WritableObjectStream extends Writable {
    constructor(obj) {
        super();
        store[obj] = "";
        this.obj = obj;
    }

    _write(chunk, encoding, callback) {
        //console.log(chunk.toString());
        store[this.obj] += chunk.toString();
        //console.log(this.obj);
        // console.log(store[this.obj]);
        callback();
    }
}

const StoreMixin = (options) => { return {
 
    methods: {

        async putObject ({ ctx = null, objectName = null, value = null } = {}) {
            if ( !ctx || !objectName || !value || typeof value !== "object" ) return null;
            this.logger.debug("putObject", { objectName: objectName, value: value });
            this.store[objectName] = value;
            return true;
        },

        async getObject ({ ctx = null, objectName = null } = {}) {
            if ( !ctx || !objectName ) return null;
            this.logger.debug("getObject", { objectName: objectName });
            return this.store[objectName];
        },

        async getString ({ ctx = null, objectName = null } = {}) {
            if ( !ctx || !objectName ) return null;
            this.logger.debug("getString", { objectName: objectName });
            return this.store[objectName];
        },

        async getStream ({ ctx = null, objectName = null } = {}) {
            if ( !ctx || !objectName ) return null;
            this.logger.debug("getStream", { objectName: objectName });

            // create stream from string
            let stream = Readable.from(this.store[objectName]);
            return stream;
        },

        async pipeStream ({ ctx = null, objectName = null } = {}) {
            if ( !ctx || !objectName ) return null;
            this.logger.debug("pipeStream", { objectName: objectName });

            let opts = { meta: ctx.meta };
            opts.meta.store = {
                objectName: objectName      
            };

            let stream = new WritableObjectStream(objectName);
            return stream;
        }
    },
    
    created: async function () {
        this.logger.info("Store started");
        this.store = store;
    }
 }}

module.exports = {
    StoreMixin,
    put,
    get,
    getStore
}