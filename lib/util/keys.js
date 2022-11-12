/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

class Keys {

    constructor ({ broker, options }) {

        // Moleculer service broker & logger
        this.broker = broker;
        this.logger = this.broker.logger;

        // service name & token
        this.service ={
            name: options?.service?.name,
            token: options?.service?.token
        };

        // set actions
        this.services = {
            keys: options?.services?.keys ?? "keys"
        };

        // cache
        this.keys = {
            default: null
        };

   }

   async getKey ({ id = null } = {}) {
            
        // key id is already known
        if (id && this.keys[id] ) return {
            id,
            key: this.keys[id]
        };
        // default key is already available
        if (!id && this.keys.default && this.keys[this.keys.default]) return {
            id: this.keys.default,
            key: this.keys[this.keys.default]
        };

        // call key service and retrieve keys
        let result = {};
        let opts;
        let params = {
            token: this.service.token,
            id,
            service: this.service.name
        };
        try {
            result = await this.broker.call(this.services.keys + ".getSek", params, opts);
            this.logger.debug("Got key from key service", { id });
        } catch (err) {
            this.logger.error("Failed to receive key from key service", { params, opts });
            throw err;
        }
        if (!result.id || !result.key) throw new Error("Failed to receive key from service", { result });
        // remember key
        this.keys[result.id] = result.key;
        if (!id) this.keys.default = result.id;
        return result;
    }

}

module.exports = {
    Keys 
}