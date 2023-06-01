"use strict";

const fs = require("fs");

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

            // try to read from assets folder
            if (!this.store[objectName]) {
                const filePath = `./assets/${ objectName }`;
                const dataString = fs.readFileSync(filePath).toString();
                return dataString;
            }

            return this.store[objectName];
        }
    },
    
    created: async function () {
        this.logger.info("Store started");
        this.store = {};
    }
 }}

module.exports = {
    StoreMixin
}