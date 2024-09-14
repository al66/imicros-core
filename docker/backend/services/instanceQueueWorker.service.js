"use strict";

const { WorkerService } = require("imicros-core");
const { Serializer } = require("imicros-core");
const { Constants } = require("imicros-core");

module.exports = {
    name: "instanceQueueWorker",
    version: 1,
    mixins: [WorkerService,Serializer],
    dependencies: ["unsealed"],
    settings: {
        topic: Constants.QUEUE_TOPIC_INSTANCE,
        fromBeginning: false,
        handler: [
            { event: "event.raised", handler: "v1.flow.processEvent" },
            { event: "instance.processed", handler: "v1.flow.continueInstance" },
            { event: "job.created", handler: "v1.flow.processJob" },
            { event: "job.completed", handler: "v1.flow.processCommitJob" },
            { event: "instance.completed", handler: "v1.flow.completeInstance"}
        ]
    }
}