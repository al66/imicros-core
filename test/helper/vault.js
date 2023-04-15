"use strict";
const { credentials } = require("./credentials");
const crypto = require("crypto");

// mock master service
const VaultMock = {
    name: "vault",
    version: 1,
    actions: {
        hash: {
            visibility: "protected",
            params: {
                key: { type: "string"},
                extension: { type: "string"}
            },
            handler(ctx) {
                return crypto.createHmac("sha256", this.masterKey+ctx.params.extension)
                .update(ctx.params.key)
                .digest("hex");
            }
        }
    },
    created () {
        this.masterKey = credentials.masterKey;
    }
};

module.exports = {
    VaultMock
};