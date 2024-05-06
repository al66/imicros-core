/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { ProcessGateway } = require("./commands");
const { GatewayMachine } = require("./../machines/machines");

class ProcessGatewayHandler extends CommandHandler {
    static forCommand () { return ProcessGateway }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.elementId, machine: GatewayMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = ProcessGatewayHandler;