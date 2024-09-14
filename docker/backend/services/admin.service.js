"use strict";

const { AdminService } = require("imicros-core");
const { AuthDatabaseProvider } = require("imicros-core");
const { VaultProvider } = require("imicros-core");
const { Publisher } = require("imicros-core");
const { Serializer } = require("imicros-core");
const { Encryption } = require("imicros-core");
const { KeysProvider } = require("imicros-core");

module.exports = {
    name: "admin",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [AdminService, AuthDatabaseProvider, Publisher, Encryption, Serializer, KeysProvider, VaultProvider], 
    dependencies: ["unsealed","v1.keys"]
}
