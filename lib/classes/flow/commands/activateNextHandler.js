/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { ActivateNext } = require("./commands");
const { InstanceMachine } = require("./../machines/machines");

class ActivateNextHandler extends CommandHandler {
    static forCommand () { return ActivateNext }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.instanceId, machine: InstanceMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = ActivateNextHandler;