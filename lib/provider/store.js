/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { StoreServiceAccess } = require("../classes/store/store");
 
const Store = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.store = new StoreServiceAccess({ 
            broker: this.broker,
            logger: this.broker.logger,
            options: this.settings?.store || {} 
        });

    }
      
} 
  
module.exports = {
    Store
}