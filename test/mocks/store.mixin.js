"use strict";

const store = {};

function put(objectName, any) {
    store[objectName] = any;
}

function get(objectName) {
    return store[objectName];
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
    get
}