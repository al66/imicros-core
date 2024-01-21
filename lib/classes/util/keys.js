/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const crypto = require("crypto");
 const { v4: uuid } = require("uuid");
class Keys {

    constructor ({ broker, options, db, vault }) {

        // Moleculer service broker & logger
        this.broker = broker;
        this.logger = this.broker.logger;

        // Database
        this.db = db;

        // Vault provider
        this.vault = vault;

        // service token
        this.owner = {
            token: "authm"
        };

        // key length
        this.keyLen = options?.key?.len || 32;

        // expires after x days
        this.expirationDays = options?.key?.expirationDays || 30;

        // cache
        this.keys = {};

   }

   async getKey ({ id = null } = {}) {

        /*
        console.log("GET_KEY", id);
        return {
            id: "default",
            key: "secret"
        }
        */

        // not available or expired? refresh cache
        if (!this.keys.default || (id && !this.keys[id]) || (!id && this.keys.default && this.keys[this.keys.default] && this.keys[this.keys.default].exp < new Date().getTime())) await this.refreshCache({ rotate: true });

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
        key.key = await this.vault.hash(key.key, this.owner.token);
        return key;

    }

    async refreshCache({ rotate = false } = {}) {
        let result;
        if (!rotate) result = await this.db.readKeys({ owner: this.owner.token });
        if (!result || rotate) {
            // create a new key
            const iat = new Date().getTime();
            const params = {
                owner: this.owner.token, 
                id: uuid(), 
                key: crypto.randomBytes(this.keyLen).toString("hex"),
                iat, 
                exp: iat + ( 1000 * 60 * 60 * 24 * this.expirationDays ) // add 30 days
            }
            const success = await this.db.newKey(params);
            if (!success) {
                this.logger.error("Failed to retrieve encryption key", {  owner: this.owner.token, result });
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
    Keys 
}