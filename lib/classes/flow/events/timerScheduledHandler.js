/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { TimerScheduled } = require("./events");
const { EventMachine } = require("./../machines/machines");

class TimerScheduledHandler extends EventHandler {
    static forEvent () { return TimerScheduled }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: EventMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = TimerScheduledHandler;
