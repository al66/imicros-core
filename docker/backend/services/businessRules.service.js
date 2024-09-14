"use strict";

const { BusinessRulesService } = require("imicros-core");
const { GroupsProvider } = require("imicros-core");
const { VaultProvider } = require("imicros-core");
const { StoreProvider } = require("imicros-core");

module.exports = {
    name: "businessRules",
    version: "v1",
    mixins: [BusinessRulesService,StoreProvider,GroupsProvider,VaultProvider],
    dependencies: ["v1.groups"]
}