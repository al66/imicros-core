/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";
const { Readable, PassThrough } = require("stream");

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

class StoreServiceAccess {

    // class implementation goes here
    constructor ({ broker, logger, options }) {

        this.broker = broker;

        // Moleculer logger
        this.logger = logger;

        // service name
        this.service = options.service || "v1.store"

    }

    // Method getStream
    async getStream ({ ctx = null, objectName = null } = {}) {
        if ( !ctx || !objectName ) return null;
        
        let opts = { meta: ctx.meta };
        
        // call file service
        let params = {
            objectName: objectName
        };
        try {
            let stream = await this.broker.call(this.service + ".getObject", params, opts);
            return stream;            
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to retrieve object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }

    async pipeStream ({ ctx = null, objectName = null } = {}) {
        if ( !ctx || !objectName ) return null;
        
        let opts = { meta: ctx.meta };
        opts.meta.store = {
            objectName: objectName      
        };
        
        let passThrough = new PassThrough();
        
        // call file service
        try {
            this.broker.call(this.service + ".putObject", passThrough, opts);
            return passThrough;            
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to write object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }

    async putStream ({ ctx = null, objectName = null, stream = null } = {}) {
        if ( !ctx || !objectName || !stream ) return null;
        
        let opts = { meta: ctx.meta };
        opts.meta.store = {
            objectName: objectName      
        };
        
        // call file service
        try {
            let result = await this.broker.call(this.service + ".putObject", stream, opts);
            return result;
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to write object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }

    async putString ({ ctx = null, objectName = null, value = null } = {}) {
        if ( !ctx || !objectName || !value ) return null;
        
        let opts = { meta: ctx.meta };
        opts.meta.store = {
            objectName: objectName      
        };
        
        // create stream from string
        let stream = Readable.from(value);

        // call file service
        try {
            let result = await this.broker.call(this.service + ".putObject", stream, opts);
            return result;
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to write object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }
  
    async getString ({ ctx = null, objectName = null } = {}) {
        if ( !ctx || !objectName ) return null;
        
        let opts = { meta: ctx.meta };
        
        // call file service
        let params = {
            objectName: objectName
        };
        try {
            let obj = await this.broker.call(this.service + ".get", params, opts);
            return obj;
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to retrieve object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }

    async putObject ({ ctx = null, objectName = null, value = null } = {}) {
        if ( !ctx || !objectName || !value || typeof value !== "object" ) return null;
        
        let opts = { meta: ctx.meta };
        opts.meta.store = {
            objectName: objectName      
        };
        
        // create stream from string
        // this.logger.debug("Readable:", { readable: Readable });
        // let stream = Readable.from(JSON.stringify(value));
        let stream = new ReadableObjectStream(value);
        
        // call file service
        try {
            const params = {
                objectName,
                value
            }
            let result = await this.broker.call(this.service + ".put", params, opts);
            return result;
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to write object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }
  
    async getObject ({ ctx = null, objectName = null } = {}) {
        if ( !ctx || !objectName ) return null;
        
        let opts = { meta: ctx.meta, accessToken: ctx.meta.accessToken || ctx.meta.acl?.accessToken };
        
        // call file service
        let params = {
            objectName: objectName
        };
        try {
            let obj = await this.broker.call(this.service + ".get", params, opts);
            return obj;
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to retrieve object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }
  
    async removeObject ({ ctx = null, objectName = null } = {}) {
        if ( !ctx || !objectName ) return null;
        
        let opts = { meta: ctx.meta };
        
        // call file service
        let params = {
            objectName: objectName
        };
        try {
            let result = await this.broker.call(this.service + ".removeObject", params, opts);
            return result;
        } catch (err) {
            /* istanbul ignore next */
            {
                this.logger.debug(`Failed to remove object ${objectName}`, { objectName: objectName });
                throw err;
            }
        }
    }    

}

module.exports = { 
    StoreServiceAccess
};
