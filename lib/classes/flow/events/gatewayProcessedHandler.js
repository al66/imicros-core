/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { GatewayProcessed } = require("./events");
const { GatewayMachine } = require("./../machines/machines");

class GatewayProcessedHandler extends EventHandler {
    static forEvent () { return GatewayProcessed }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: GatewayMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = GatewayProcessedHandler;
