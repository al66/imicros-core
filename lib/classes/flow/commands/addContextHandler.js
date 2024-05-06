/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { AddContext } = require("./commands");
const { InstanceMachine } = require("./../machines/machines");

class AddContextHandler extends CommandHandler {
    static forCommand () { return AddContext }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.instanceId, machine: InstanceMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = AddContextHandler;