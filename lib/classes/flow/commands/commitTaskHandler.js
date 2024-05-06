/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { CommitTask } = require("./commands");
const { TaskMachine } = require("./../machines/machines");

class CommitTaskHandler extends CommandHandler {
    static forCommand () { return CommitTask }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.elementId, machine: TaskMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = CommitTaskHandler;