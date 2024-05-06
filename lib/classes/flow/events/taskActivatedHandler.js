/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { TaskActivated } = require("./events");
const { TaskMachine } = require("./../machines/machines");

class TaskActivatedHandler extends EventHandler {
    static forEvent () { return TaskActivated }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: TaskMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = TaskActivatedHandler;
