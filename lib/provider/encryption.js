/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Encryption: EncryptionClass } = require("../classes/util/encryption");
 
const Encryption = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        if(!this.keys) throw new Error("Keys provider must be injected first")
        if(!this.serializer) throw new Error("Serializer provider must be injected first")

        this.encryption = new EncryptionClass({ 
            logger: this.broker.logger,
            keys: this.keys,
            serializer: this.serializer, 
            options: {} 
        });

    }
      
} 
  
module.exports = {
    Encryption
}