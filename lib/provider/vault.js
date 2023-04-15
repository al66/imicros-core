/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { VaultClass } = require("../util/vault");
 
const Vault = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.vault = new VaultClass({ 
            broker: this.broker,
            logger: this.broker.logger,
            options: this.settings?.vault || {} 
        });

    }
      
} 
  
module.exports = {
    Vault
}