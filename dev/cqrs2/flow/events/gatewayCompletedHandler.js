"use strict";

const { EventHandler } = require("./../../basic/handler");
const { GatewayCompleted } = require("./events");
const { GatewayMachine } = require("./../machines/machines");

class GatewayCompletedHandler extends EventHandler {
    static forEvent () { return GatewayCompleted }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: GatewayMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = GatewayCompletedHandler;
