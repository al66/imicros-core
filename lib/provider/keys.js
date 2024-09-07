/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { KeysServiceAccess } = require("../classes/provider/keys");

const KeysProvider = {

    /**
     * Service created lifecycle event handler
     */
    async created() {

        if (!this.vault) throw new Error("Vault provider must be injected first");

        const options = {
            owner: this.settings?.keys?.owner || "authm"
        }

        //assign provider class
        this.keys = new KeysServiceAccess({ broker: this.broker, options , vault: this.vault });

    },

    async started () {
    },

    async stopped () {
    }

} 
 
module.exports = {
    KeysProvider
}