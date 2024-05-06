/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { TaskFinished } = require("./events");
const { TaskMachine } = require("./../machines/machines");

class TaskFinishedHandler extends EventHandler {
    static forEvent () { return TaskFinished }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: TaskMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = TaskFinishedHandler;
