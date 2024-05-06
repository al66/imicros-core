/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { JobFailed } = require("./events");
const { JobMachine } = require("./../machines/machines");

class JobFailedHandler extends EventHandler {
    static forEvent () { return JobFailed }

    async apply (event) {
        //const instance = this.application.getModelById(event.instanceId);
        const instance = await this.application.addModel({ uid: event.jobId, machine: JobMachine, meta: event.$_meta || {} });
        if (instance) await instance.apply(event);
    }
}

module.exports = JobFailedHandler;

