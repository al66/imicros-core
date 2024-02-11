"use strict";
const { credentials } = require("../helper/credentials");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// mock master service
const VaultServiceMock = {
    name: "vault",
    version: 1,
    actions: {
        hash: {
            visibility: "protected",
            params: {
                key: { type: "string"},
                extension: { type: "string", optional: true}
            },
            handler(ctx) {
                return crypto.createHmac("sha256", this.masterKey+ctx.params.extension)
                .update(ctx.params.key)
                .digest("hex");
            }
        },
        signToken: {
            visibility: "public",
            params: {
                payload: { type: "object"},
                options: { type: "object", optional: true, default: {} }
            },
            handler(ctx) {
                return { token: jwt.sign(ctx.params.payload, this.masterKey ,ctx.params.options) };
            }
        },
        verifyToken: {
            visibility: "public",
            params: {
                token: { type: "string"}
            },
            handler(ctx) {
                try{
                    return { payload: jwt.verify(ctx.params.token, this.masterKey) };
                } catch (err) {
                    throw new Error("no valid token");
                }
            }
        }

    },
    created () {
        this.masterKey = credentials.masterKey;
    }
};

module.exports = {
    VaultServiceMock
};