"use strict";

const { CommandHandler } = require("./../../basic/handler");
const { ConditionalNext } = require("./commands");
const { InstanceMachine } = require("./../machines/machines");

class ConditionalNextHandler extends CommandHandler {
    static forCommand () { return ConditionalNext }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.instanceId, machine: InstanceMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = ConditionalNextHandler;