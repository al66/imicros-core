"use strict";

const { Constants } = require("../../../../lib/classes/util/constants");

const { AddContext } = require("./../commands/commands");
const { ActivateNext } = require("./../commands/commands");

const { EventOccured } = require("./../events/events");

module.exports = {
    name: "EventMachine",
    initialState: "created",
    init: ({ self, meta }) => {
        self.context.element = meta.element;
        self.context.instanceId = meta.instanceId;
        if (meta.element.position === Constants.START_EVENT) {
            self.type = "startEvent";
        } else if (meta.element.position === Constants.BOUNDARY_EVENT) {
            self.type = "boundaryEvent";
        } else if (meta.element.position === Constants.END_EVENT) {
            self.type = "endEvent";
        }
    },
    states: {
        startEvent: {
            created: {
                onRaiseEvent: async ({ command, self }) => {
                    self.context.payload = command.payload;
                    for (const output of self.context.element.output) {
                        await self.execute(new AddContext({ 
                            instanceId: self.context.instanceId,
                            elementId: self.context.element.id,
                            key: output.target, 
                            expression: output.source.substr(1), 
                            context: command.payload 
                        }));
                    };
                    self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                },
                onEventOccured: ({ event, self }) => {
                    self.state = "finished";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            },
            finished: {}
        },
        endEvent: {
            created: {
                onActivateElement: async ({ command, self }) => {
                    const throwing = {
                        instanceId: self.context.instanceId,
                        elementId: self.context.element.id,
                        version: self.application.getVersion(),
                        eventId: self.context.element.localId,
                        payload: command.scopedContext
                    };
                    self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id, throwing }));
                },
                onEventOccured: ({ event, self }) => {
                    if (event.throwing) self.context.throwing = event.throwing;
                    console.log("End Event occured", event, self.context.throwing);
                    self.state = "finished";
                }
            },
            finished: {}
        }
    }
};