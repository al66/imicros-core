"use strict";

const { WorkerService } = require("imicros-core");
const { Serializer } = require("imicros-core");
const { Constants } = require("imicros-core");

module.exports = {
    name: "eventQueueWorker",
    version: 1,
    mixins: [WorkerService,Serializer],
    dependencies: ["unsealed"],
    settings: {
        topic: Constants.QUEUE_TOPIC_EVENTS,
        fromBeginning: false,
        handler: [
            { event: "event.raised", handler: "v1.flow.assignEvent" },
            { event: "instance.requested", handler: "v1.flow.createInstance" }
        ]
    }
}