/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { ProcessTask } = require("./commands");
const { TaskMachine } = require("./../machines/machines");

class ProcessTaskHandler extends CommandHandler {
    static forCommand () { return ProcessTask }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.elementId, machine: TaskMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = ProcessTaskHandler;