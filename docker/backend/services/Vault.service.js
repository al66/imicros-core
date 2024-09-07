"use strict";

const { VaultService } = require("imicros-core");
const { VaultDatabaseProvider } = require("imicros-core");

module.exports = { 
    name: "vault",
    version: "v1",
    mixins: [VaultService, VaultDatabaseProvider],
    settings: {
        service: {
            unsealed: "unsealed",
        },
        expirationDays: 20
    }
};
