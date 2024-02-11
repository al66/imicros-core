/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { GroupsServiceAccess } = require("../classes/provider/groups");

const GroupsProvider = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        if (!this.vault) throw new Error("Vault provider must be injected first");

        this.groups = new GroupsServiceAccess({ 
            broker: this.broker,
            logger: this.broker.logger,
            vault: this.vault,
            options: this.settings?.groups || {} 
        });

    }
      
} 
  
module.exports = {
    GroupsProvider
}