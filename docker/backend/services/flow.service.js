"use strict";

const { FlowService } = require("imicros-core");
const { GroupsProvider } = require("imicros-core");
const { VaultProvider } = require("imicros-core");
const { StoreProvider } = require("imicros-core");
const { BusinessRulesProvider } = require("imicros-core");
const { QueueProvider } = require("imicros-core");


module.exports = {
    name: "flow",
    version: "v1",
    mixins: [FlowService,BusinessRulesProvider,StoreProvider,QueueProvider,GroupsProvider,VaultProvider],
    dependencies: ["v1.groups"]
}