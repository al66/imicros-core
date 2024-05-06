/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { SequenceActivated } = require("./events");
const { SequenceMachine } = require("./../machines/machines");

class SequenceActivatedHandler extends EventHandler {
    static forEvent () { return SequenceActivated }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: SequenceMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = SequenceActivatedHandler;
