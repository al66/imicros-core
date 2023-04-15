/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

class VaultClass {

    constructor ({ broker, logger, options }) {

        this.broker = broker;

        // Moleculer logger
        this.logger = logger;

        // master setup
        this.service = options.service || "vault"

        // master key
        this.masterKey = null;

    }

    async hash (key, owner) {
        const params = {
            key,
            extension: owner
        };
        const hashed = await this.broker.call(`${ this.service }.hash`, params);
        return hashed;
    }

}

module.exports = {
    VaultClass
};
 
