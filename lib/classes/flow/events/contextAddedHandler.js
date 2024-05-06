/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { ContextAdded } = require("./events");
const { InstanceMachine } = require("./../machines/machines");

class ContextAddedHandler extends EventHandler {
    static forEvent () { return ContextAdded }

    async apply (event) {
        //const instance = this.application.getModelById(event.instanceId);
        const instance = await this.application.addModel({ uid: event.instanceId, machine: InstanceMachine, meta: event.$_meta || {} });
        if (instance) await instance.apply(event);
    }
}

module.exports = ContextAddedHandler;

