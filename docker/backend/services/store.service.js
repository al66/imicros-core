"use strict";

const { StoreService } = require("imicros-core");
const { GroupsProvider } = require("imicros-core");
const { VaultProvider } = require("imicros-core");

module.exports = {
    name: "store",
    version: "v1",
    mixins: [StoreService, GroupsProvider, VaultProvider], 
    dependencies: ["unsealed"]
}