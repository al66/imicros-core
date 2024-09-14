"use strict";

const { TemplateService } = require("imicros-core");
const { StoreProvider } = require("imicros-core");

module.exports = {
    name: "templates",
    version: "v1",
    mixins: [TemplateService,StoreProvider],
    dependencies: ["v1.store"]
}