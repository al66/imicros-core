/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { ActivateElement } = require("./commands");
const { InstanceMachine } = require("./../machines/machines");

class ActivateElementHandler extends CommandHandler {
    static forCommand () { return ActivateElement }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.instanceId, machine: InstanceMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = ActivateElementHandler;