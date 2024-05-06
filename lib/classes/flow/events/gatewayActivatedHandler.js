/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("./../basic/handler");
const { GatewayActivated } = require("./events");
const { GatewayMachine } = require("./../machines/machines");

class GatewayActivatedHandler extends EventHandler {
    static forEvent () { return GatewayActivated }

    async apply (event) {
       const instance = await this.application.addModel({ uid: event.elementId, machine: GatewayMachine, meta: event.$_meta || {} });
       if (instance) await instance.apply(event);
    }
}

module.exports = GatewayActivatedHandler;
