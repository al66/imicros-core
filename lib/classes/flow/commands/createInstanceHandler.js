/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { CreateInstance } = require("./commands");
const { InstanceMachine } = require("./../machines/machines");

class CreateInstanceHandler extends CommandHandler {
    static forCommand () { return CreateInstance }

    async execute (command) {
       const instance = await this.application.addModel({ uid: command.instanceId, machine: InstanceMachine });
       if (instance) await instance.dispatch(command);
    }
}

module.exports = CreateInstanceHandler;
