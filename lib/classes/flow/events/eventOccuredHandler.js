/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { EventOccured } = require("./events");
const { EventMachine } = require("./../machines/machines");

class EventOccuredHandler extends EventHandler {
    static forEvent () { return EventOccured }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: EventMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = EventOccuredHandler;
