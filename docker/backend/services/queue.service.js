"use strict";

const { QueueService } = require("imicros-core");
const { Serializer } = require("imicros-core");

module.exports = {
    name: "queue",
    version: "v1",
    mixins: [QueueService,Serializer],
    dependencies: ["unsealed"]
}