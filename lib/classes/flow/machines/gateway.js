/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../../util/constants");

const { ProcessGateway,
        ActivateNext,
        ConditionalNext } = require("./../commands/commands");

const { GatewayActivated,
        GatewayProcessed,
        GatewayCompleted } = require("./../events/events");

function getType (element) {
    let type;
    if (element.type === Constants.EXCLUSIVE_GATEWAY) type = "exclusiveGateway";
    if (element.type === Constants.PARALLEL_GATEWAY) type = "parallelGateway";
    return type;
}

module.exports = {
    name: "GatewayMachine",
    initialState: "idle",
    init: ({ self, meta }) => {
    },
    states: {
        onActivateElement: async ({ command, self }) => {
            await self.emit(new GatewayActivated({ 
                instanceId: command.instanceId, 
                elementId: command.element.id, 
                element: command.element, 
                type: getType(command.element)
            }));
            self.execute(new ProcessGateway({ instanceId: command.instanceId, elementId: command.element.id, previous: command.previous }));
        },
        onGatewayActivated: async ({ event, self }) => {
            self.context.instanceId = event.instanceId;
            self.context.element = event.element;
            self.type = event.type;
        },
        exclusiveGateway: {
            idle: {
                onProcessGateway: async ({ command, self }) => {
                    await self.emit(new GatewayProcessed({ instanceId: command.instanceId, elementId: command.elementId }));
                    // pass through
                    self.emit(new GatewayCompleted({ instanceId: self.context.instanceId, elementId: command.elementId }));
                },
                onGatewayProcessed: async ({ event, self }) => {
                    self.state = "active";
                }
            },
            active: {
                onGatewayCompleted: async ({ event, self }) => {
                    self.state = "idle";
                    // multiple outgoing -> condition based activation of outgoing
                    if (self.context.element.outgoing.length > 1) {
                        self.execute(new ConditionalNext({ 
                            instanceId: self.context.instanceId, 
                            elementId: self.context.element.id,
                            outgoing: self.context.element.outgoing,
                            default: self.context.element.default
                         }));
                    // only one outgoing -> activate directly
                    } else {
                        self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                    }
                }
            },
        },
        parallelGateway: {
            onProcessGateway: async ({ command, self }) => {
                await self.emit(new GatewayProcessed({ instanceId: command.instanceId, elementId: command.elementId, previous: command.previous }));
                // wait for all incoming before completion
                if (self.context.incoming.length === self.context.element.incoming.length) {
                    self.emit(new GatewayCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            },
            idle: {
                onGatewayProcessed: async ({ event, self }) => {
                    self.state = "active";
                    self.context.incoming = [event.previous];
                }
            },
            active: {
                onGatewayProcessed: async ({ event, self }) => {
                    // collect incoming
                    if (self.context.incoming.indexOf(event.previous) === -1) {
                        self.context.incoming.push(event.previous);
                    }
                },
                onGatewayCompleted: async ({ event, self }) => {
                    self.state = "idle";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            }
        }
    }
};