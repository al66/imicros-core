/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";
const crypto = require("crypto");

class EnvironmentSecret { 

    constructor ({ broker, logger }) {
        
        this.broker = broker;
        
        // Moleculer logger
        this.logger = logger;
        
        // master key
        this.masterKey = process.env.MASTER_KEY || null;
        
    }
    
    async hash (key, owner) {
        return crypto.createHmac("sha256", this.masterKey+owner)
        .update(key)
        .digest("hex");
    }
    
}

module.exports = {
    EnvironmentSecret
};
