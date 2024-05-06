/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { CommitEvent } = require("./commands");
const { EventMachine } = require("./../machines/machines");

class CommitEventHandler extends CommandHandler {
    static forCommand () { return CommitEvent }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.elementId, machine: EventMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = CommitEventHandler;