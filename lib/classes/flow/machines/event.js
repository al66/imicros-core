/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../../util/constants");
const { v4: uuid } = require("uuid");

const { ProcessEvent,
        AddContext,
        ActivateNext } = require("./../commands/commands");

const { EventActivated,
        EventSubscriptionAdded,
        EventOccured,
        JobCreated } = require("./../events/events");

function getType (element) {
    if (element.position === Constants.START_EVENT) return "startEvent";
    if (element.position === Constants.INTERMEDIATE_EVENT && 
        element.type === Constants.MESSAGE_EVENT && 
        element.direction === Constants.THROWING_EVENT) return "intermediateMessageThrowingEvent";
        if (element.position === Constants.INTERMEDIATE_EVENT && 
            element.type === Constants.MESSAGE_EVENT && 
            element.direction === Constants.CATCHING_EVENT) return "intermediateMessageCatchingEvent";
        if (element.position === Constants.BOUNDARY_EVENT) return "boundaryEvent";
    if (element.position === Constants.END_EVENT &&
        element.type === Constants.MESSAGE_EVENT && 
        element.direction === Constants.THROWING_EVENT) return "endEventMessageThrowing";
    if (element.position === Constants.END_EVENT) return "endEvent";
}

module.exports = {
    name: "EventMachine",
    initialState: "created",
    init: ({ self, meta }) => {
    },
    states: {
        onActivateElement: async ({ command, self }) => {
            await self.emit(new EventActivated({ 
                instanceId: command.instanceId, 
                elementId: command.element.id, 
                element: command.element, 
                type: getType(command.element),
                scopedContext: command.scopedContext
            }));
            self.execute(new ProcessEvent({ instanceId: command.instanceId, elementId: command.element.id }));
        },
        onEventActivated: ({ event, self }) => {
            self.context.instanceId = event.instanceId;
            self.context.element = event.element;
            if (event.payload) self.context.payload = event.payload;
            if (event.scopedContext) self.context.scopedContext = event.scopedContext;
            self.type = event.type;
            self.state = "activated";
        },
        created: {
            onRaiseEvent: async ({ command, self }) => {
                for (const output of command.element.output) {
                    await self.execute(new AddContext({ 
                        instanceId: command.instanceId,
                        elementId: command.element.id,
                        key: output.target, 
                        expression: output.source.substr(1), 
                        context: command.payload 
                    }));
                };
                await self.emit(new EventActivated({ 
                    instanceId: command.instanceId, 
                    elementId: command.element.id, 
                    element: command.element, 
                    type: getType(command.element),
                    payload: command.payload 
                }));
                self.execute(new ProcessEvent({ instanceId: command.instanceId, elementId: command.element.id }));
            }
        },
        startEvent: {
            activated: {
                onProcessEvent: ({ command, self }) => {
                    self.emit(new EventOccured({ instanceId: command.instanceId, elementId: command.elementId }));
                },
                onEventOccured: ({ event, self }) => {
                    self.state = "finished";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            },
            finished: {}
        },
        boundaryEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    self.emit(new EventOccured({ instanceId: command.instanceId, elementId: command.elementId }));
                },
                onEventOccured: ({ event, self }) => {
                    self.state = "finished";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            },
            finished: {}
        },
        intermediateMessageThrowingEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    const job = {
                        instanceId: command.instanceId,
                        jobId: uuid(),
                        version: self.application.getVersion(),
                        originId: self.uid,
                        type: "event",
                        taskDefinition: {
                            type: self.context.element.taskDefinition.type,
                            retries: self.context.element.taskDefinition.retries,
                        },
                        data: self.context.scopedContext
                    };
                    self.emit(new JobCreated(job));
                },
                onCommitEvent: async ({ command, self }) => {
                    if (!command.error) {
                        const throwing = {
                            uid: uuid(),
                            instanceId: self.context.instanceId,
                            elementId: self.context.element.id,
                            version: self.application.getVersion(),
                            eventId: self.context.element.localId,
                            payload: self.context.scopedContext
                        };
                        self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id, throwing }));
                    } else {
                        // ignore?
                        self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                    }
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                },
                onEventOccured: ({ event, self }) => {
                    if (event.throwing) self.context.throwing = event.throwing;
                }
            }
        },
        intermediateMessageCatchingEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    const correlationId = self.context.element.correlation.startsWith("=") ? self.application.evaluate({ expression: self.context.element.correlation.substr(1) }) : self.context.element.correlation;
                    const subscription = {
                        instanceId: command.instanceId,
                        subscriptionId: uuid(),
                        version: self.application.getVersion(),
                        elementId: self.context.element.id,
                        type: Constants.SUBSCRIPTION_TYPE_MESSAGE,
                        hash: self.application.getHash(self.context.element.messageCode || self.context.element.id), // does not work w/o messageCode
                        correlationId,
                        correlationExpression: self.context.element.correlationExpression.substr(1)
                    };
                    self.emit(new EventSubscriptionAdded({ instanceId: command.instanceId, elementId: command.elementId, subscription }));
                },
                onEventSubscriptionAdded: ({ event, self }) => {
                    self.context.subscription = event.subscription;
                },
                onRaiseEvent: async ({ command, self }) => {
                    for (const output of command.element.output) {
                        await self.execute(new AddContext({ 
                            instanceId: command.instanceId,
                            elementId: command.element.id,
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
        endEventMessageThrowing: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    const job = {
                        instanceId: command.instanceId,
                        jobId: uuid(),
                        version: self.application.getVersion(),
                        originId: self.uid,
                        type: "event",
                        taskDefinition: {
                            type: self.context.element.taskDefinition.type,
                            retries: self.context.element.taskDefinition.retries,
                        },
                        data: self.context.scopedContext
                    };
                    self.emit(new JobCreated(job));
                },
                onCommitEvent: async ({ command, self }) => {
                    if (!command.error) {
                        const throwing = {
                            uid: uuid(),
                            instanceId: self.context.instanceId,
                            elementId: self.context.element.id,
                            version: self.application.getVersion(),
                            eventId: self.context.element.localId,
                            payload: self.context.scopedContext
                        };
                        self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id, throwing }));
                    } else {
                        // ignore?
                        self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                    }
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                },
                onEventOccured: ({ event, self }) => {
                    if (event.throwing) self.context.throwing = event.throwing;
                    self.state = "finished";
                }
            },
            finished: {}
        },
        endEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    const throwing = {
                        uid: uuid(),
                        instanceId: self.context.instanceId,
                        elementId: self.context.element.id,
                        version: self.application.getVersion(),
                        eventId: self.context.element.localId,
                        payload: self.context.scopedContext
                    };
                    self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id, throwing }));
                },
                onEventOccured: ({ event, self }) => {
                    if (event.throwing) self.context.throwing = event.throwing;
                    self.state = "finished";
                }
            },
            finished: {}
        }
    }
};