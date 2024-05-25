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
        TimerScheduled,
        JobCreated } = require("./../events/events");

function getType (element) {
    if (element.position === Constants.START_EVENT && element.type === Constants.TIMER_EVENT) return "startTimerEvent";
    // default start event
    if (element.position === Constants.START_EVENT) return "startEvent";
    if (element.position === Constants.INTERMEDIATE_EVENT && 
        element.type === Constants.MESSAGE_EVENT && 
        element.direction === Constants.THROWING_EVENT) return "intermediateMessageThrowingEvent";
    if (element.position === Constants.INTERMEDIATE_EVENT && 
        element.type === Constants.MESSAGE_EVENT && 
        element.direction === Constants.CATCHING_EVENT) return "intermediateMessageCatchingEvent";
    if (element.position === Constants.INTERMEDIATE_EVENT && 
        element.type === Constants.TIMER_EVENT && 
        element.direction === Constants.CATCHING_EVENT) return "intermediateTimerCatchingEvent";
    if (element.position === Constants.BOUNDARY_EVENT) return "boundaryEvent";
    if (element.position === Constants.END_EVENT &&
        element.type === Constants.MESSAGE_EVENT && 
        element.direction === Constants.THROWING_EVENT) return "endEventMessageThrowing";
    // default end event
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
        startTimerEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    if (self.context.element.type === Constants.TIMER_EVENT && self.context?.payload?.timer) {
                        const schedule = self.application.getTimerSchedule({ timer: self.context.payload.timer });
                        const timer = {
                            timerId: schedule.id,
                            version: self.application.getVersion(),
                            timer: {                                // encrypted in database
                                eventId: self.context.element.localId,
                                payload: {
                                    timer: schedule.timer
                                }
                            },
                            day: schedule.day,
                            time: schedule.time
                        };
                        await self.emit(new TimerScheduled({ instanceId: command.instanceId, elementId: command.elementId, timer }));
                    }
                    self.emit(new EventOccured({ instanceId: command.instanceId, elementId: command.elementId }));
                },
                onTimerScheduled: ({ event, self }) => {
                    self.context.timer = event.timer;
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
        intermediateTimerCatchingEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    if (self.context?.element?.timer) {
                        const schedule = self.application.getTimerSchedule({ timer: self.context.element.timer });
                        const timer = {
                            timerId: schedule.id,
                            version: self.application.getVersion(),
                            instanceId: self.context.instanceId,
                            timer: {                                // encrypted in database
                                eventId: self.context.element.localId,
                                payload: {
                                    timer: schedule.timer
                                }
                            },
                            day: schedule.day,
                            time: schedule.time
                        };
                        await self.emit(new TimerScheduled({ instanceId: command.instanceId, elementId: command.elementId, timer }));
                    }
                },
                onTimerScheduled: ({ event, self }) => {
                    self.context.timer = event.timer;
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
                        await self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id, throwing }));
                    } else {
                        // ignore?
                        await self.emit(new EventOccured({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
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
        intermediateMessageCatchingEvent: {
            activated: {
                onProcessEvent: async ({ command, self }) => {
                    const correlationId = self.context.element.correlation.startsWith("=") ? self.application.evaluate({ expression: self.context.element.correlation.substr(1) }) : self.context.element.correlation;
                    // subscription will not work w/o messageCode
                    const subscriptionValue = (self.context.element.messageCode || self.context.element.id) + (correlationId || "");
                    const subscription = {
                        instanceId: command.instanceId,
                        subscriptionId: uuid(),
                        version: self.application.getVersion(),
                        elementId: self.context.element.id,
                        type: Constants.SUBSCRIPTION_TYPE_MESSAGE,
                        hash: self.application.getHash(subscriptionValue)
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