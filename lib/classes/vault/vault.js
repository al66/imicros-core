/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

class VaultServiceAccess {

    constructor ({ broker, logger, options }) {

        this.broker = broker;

        // Moleculer logger
        this.logger = logger;

        // master setup
        this.service = options.service || "vault"

    }

    async hash (key, owner) {
        const params = {
            key,
            extension: owner
        };
        const hashed = await this.broker.call(`${ this.service }.hash`, params);
        return hashed;
    }

    async signToken (payload, options = {}) {
        const params = {
            payload,
            options
        };
        const result = await this.broker.call(`${ this.service }.signToken`, params);
        return result.token;
    }

    async verifyToken (token) {
        const params = {
            token
        };
        const result = await this.broker.call(`${ this.service }.verifyToken`, params);
        return result.payload;
    }

}

module.exports = {
    VaultServiceAccess
};
 
