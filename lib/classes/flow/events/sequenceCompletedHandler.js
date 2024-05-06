/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { SequenceCompleted } = require("./events");
const { SequenceMachine } = require("./../machines/machines");

class SequenceCompletedHandler extends EventHandler {
    static forEvent () { return SequenceCompleted }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: SequenceMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = SequenceCompletedHandler;
