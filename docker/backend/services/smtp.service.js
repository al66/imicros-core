"use strict";

const { SmtpService } = require("imicros-core");
const { GroupsProvider } = require("imicros-core");
const { VaultProvider } = require("imicros-core");
const { StoreProvider } = require("imicros-core");

module.exports = {
    name: "smtp",
    version: "v1",
    mixins: [SmtpService,StoreProvider,GroupsProvider,VaultProvider],
    dependencies: ["v1.groups"]
}