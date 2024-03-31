/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const { JobMachine } = require("./job");
const { v4: uuid } = require("uuid");

const SendTaskMachine = {
    id: "task",
    initial: "idle",
    context: ({ input }) => ({ 
        instanceId : input.instanceId,
        element: input.element,
        data: input.scopedContext
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context, self }) => ({ type: "log", data: { message: "Send Task created",  data: { id: self.id, elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        description: "schedule job for send task",
                        target: "waiting",
                        actions: [
                            raise(({ context, event }) => ({ type: "create.job", data: { element: context.element, data: event.data }})),
                            sendParent(({ context }) => ({ type: "log", data: { message: "Send Task activated - prepare job",  data: { elementId: context.element.id, type: context.element.type } }}))
                        ]
                    }
                ]
            }
        },
        waiting: {
            on: {
                commit: {
                    target: "completed",
                    actions: [
                        sendParent(({ context }) => ({ type: "log", data: { message: "Task comitted",  data: { elementId: context.element.id, type: context.element.type } }})),
                        sendParent(({ context }) => ({ type: "activate.next", data: { elementId: context.element.id }}) )
                    ]
                },
                failed: {
                    target: "error",
                    actions: [
                        sendParent(({ context, event }) => ({ type: "activate.boundary", data: { elementId: context.element.id, type: Constants.EVENT_ERROR, data: event.data.data }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Task failed",  data: { elementId: context.element.id, type: context.element.type } }}))
                    ]
                }
            }
        },
        error: {
            type: "final"
        },
        completed: {
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
                    // spawn(machine, { id: event.data.id, input: { element: event.data.element } })
                    // hack - spawn is only passed to assign
                    return { }            
                }),                
                sendParent(({ event }) => ({ type: "job.scheduled", data: event.data}))
            ]
        },
    }
};

module.exports = {
    SendTaskMachine
};
