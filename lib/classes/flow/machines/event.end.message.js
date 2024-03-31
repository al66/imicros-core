/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const { JobMachine } = require("./job");
const { v4: uuid } = require("uuid");

const MessageEndEventMachine = {
    id: "event",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element,
        data: input.scopedContext
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ 
            type: "log", data: { message: "End Message Event created (M)",  data: { elementId: context.element.id, position: context.element.position, data: context.data } 
        }}))
    ],
    states: {
        idle: {
            on: {
                activate: [{
                    description: "schedule job for sending message event",
                    target: "waiting",
                    actions: [
                        raise(({ context, event }) => ({ type: "create.job", data: { element: context.element, data: event.data }})),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Message end event activated - prepare job",  data: { elementId: context.element.id, type: context.element.type } }}))
                    ]
                }]
            }
        },
        waiting: {
            on: {
                commit: {
                    description: "sending job commited by service",
                    target: "occured",
                    actions: [
                        sendParent(({ context }) => ({ 
                            type: "event.occured", data: { name: context.element.name || context.element.localId, payload: context.data } 
                        })),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Send event comitted",  data: { elementId: context.element.id, type: context.element.type } }})),
                        sendParent(({ context }) => ({ type: "activate.next", data: { elementId: context.element.id }}) )
                    ]
                },
                failed: {
                    target: "error",
                    actions: [
                        sendParent(({ context, event }) => ({ type: "process.error", data: { elementId: context.element.id, type: Constants.EVENT_ERROR, data: event.data.data }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Send event service failed",  data: { elementId: context.element.id, type: context.element.type } }}))
                    ]
                }
            }
        },
        error: {
            type: "final"
        },
        occured: {
            type: "final"
        }
    },
    on: {
        "create.job": {
            actions: [
                ({context, event, self}) => {
                    const jobId = uuid();
                    self.send({ type: "job.created", data: { 
                        jobId: jobId, 
                        element: event.data.element, 
                        data: context.data
                    }});
                    return { }            
                }
            ]
        },
        "job.created": {
            actions: [
                assign(({context, spawn, event, self}) => {
                    const machine = createMachine(JobMachine, { systemId: event.data.jobId, inspect: self.inspect });
                    spawn(machine, { id: event.data.jobId, systemId: event.data.jobId, input: { element: event.data.element, instanceId: self.id, data: context.data } });
                    // hack - spawn is only passed to assign
                    return { }            
                }),                
                sendParent(({ event }) => ({ type: "job.scheduled", data: event.data}))
            ]
        },
    }
};

module.exports = {
    MessageEndEventMachine
};
