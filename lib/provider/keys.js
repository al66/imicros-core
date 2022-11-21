/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Keys: KeysClass } = require("../util/keys");

const Keys = {

    /**
     * Methods
     */
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    async created() {

        const options = {
            service: {
                name: this.settings?.keys?.client?.name || this.name,
                token: this.settings?.keys?.client?.token
            },
            services: {
                keys: this.settings?.keys?.service || "keys"
            }
        }
        this.keys = new KeysClass({ broker: this.broker, options });
        
    }
     
} 
 
module.exports = {
   Keys
}