/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { VaultServiceAccess } = require("../classes/provider/vault");

const VaultProvider = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.vault = new VaultServiceAccess({ 
            broker: this.broker,
            logger: this.broker.logger,
            options: this.settings?.vault || {} 
        });

    }
      
} 
  
module.exports = {
    VaultProvider
}