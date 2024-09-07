/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

class KeysServiceAccess {

   constructor ({ broker, options, vault }) {

       // Moleculer service broker & logger
       this.broker = broker;
       this.logger = this.broker.logger;

       // Vault provider
       this.vault = vault;

       this.service = options.service || "v1.keys"

       // key chain owner
       this.owner = options.owner || "authm";

       // cache
       this.keys = {};

  }

  async getKey ({ id = null } = {}) {

       // not available or expired? refresh cache
       if (!this.keys.default || (id && !this.keys[id])) await this.refreshCache();
       // default key expires ?
       if (!id && this.keys.default && this.keys[this.keys.default] && this.keys[this.keys.default].exp < new Date().getTime()) await this.refreshCache({ rotate: true });

       let key = {};
       // return key by id
       if (id && this.keys[id] ) key = {
           id,
           key: this.keys[id].key
       };
       // return default key
       if (!id && this.keys.default && this.keys[this.keys.default]) key = {
               id: this.keys.default,
               key: this.keys[this.keys.default].key
       };
       // hash with master key
       key.key = await this.vault.hash(key.key, this.owner);
       return key;

   }

   async refreshCache({ rotate = false } = {}) {
       let result;
       if (!rotate) result = await this.broker.call(this.service + ".readKeys", { owner: this.owner });
       if (!result || rotate) {
           const success = await this.broker.call(this.service + ".newKey", { owner: this.owner });
           if (!success) {
               this.logger.error("Failed to retrieve encryption key", {  owner: this.owner, result });
               throw new Error("Failed to retrieve encryption key");
           }
           await this.refreshCache();
       } else {
           // update cache
           this.keys = result.keys;
       }
   }

}

module.exports = {
   KeysServiceAccess 
}