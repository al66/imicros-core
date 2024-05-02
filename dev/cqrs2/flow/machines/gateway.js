"use strict";

const { Constants } = require("../../../../lib/classes/util/constants");

const { ActivateNext } = require("./../commands/commands");
const { ConditionalNext } = require("./../commands/commands");

const { GatewayActivated } = require("./../events/events");
const { GatewayCompleted } = require("./../events/events");

module.exports = {
    name: "GatewayMachine",
    initialState: "idle",
    init: ({ self, meta }) => {
        self.context.element = meta.element;
        self.context.instanceId = meta.instanceId;
        if (meta.element.type === Constants.EXCLUSIVE_GATEWAY) {
            self.type = "exclusiveGateway";
        }
    },
    states: {
        exclusiveGateway: {
            idle: {
                onActivateElement: async ({ command, self }) => {
                    self.emit(new GatewayActivated({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                },
                onGatewayActivated: async ({ event, self }) => {
                    self.state = "active";
                    self.emit(new GatewayCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            },
            active: {
                onGatewayCompleted: async ({ event, self }) => {
                    self.state = "idle";
                    if (self.context.element.outgoing.length > 1) {
                        self.execute(new ConditionalNext({ 
                            instanceId: self.context.instanceId, 
                            elementId: self.context.element.id,
                            outgoing: self.context.element.outgoing,
                            default: self.context.element.default
                         }));
                    } else {
                        self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                    }
                }
            },
        }
    }
};