"use strict";

const { UsersService } = require("imicros-core");
const { AuthDatabaseProvider } = require("imicros-core");
const { VaultProvider } = require("imicros-core");
const { Publisher } = require("imicros-core");
const { Serializer } = require("imicros-core");
const { Encryption } = require("imicros-core");
const { Keys } = require("imicros-core");

module.exports = {
    name: "users",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [UsersService, AuthDatabaseProvider, Publisher, Encryption, Serializer, Keys, VaultProvider], 
    dependencies: ["unsealed"],
    settings
}
