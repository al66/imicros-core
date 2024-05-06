/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { JobCreated } = require("./events");
const { JobMachine } = require("./../machines/machines");

class JobCreatedHandler extends EventHandler {
    static forEvent () { return JobCreated }

    async apply (event) {
        //const instance = this.application.getModelById(event.instanceId);
        const instance = await this.application.addModel({ uid: event.jobId, machine: JobMachine, meta: event.$_meta || {} });
        if (instance) await instance.apply(event);
    }
}

module.exports = JobCreatedHandler;

