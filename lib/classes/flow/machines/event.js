/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const { v4: uuid } = require("uuid");

const EventMachine = {
    id: "event",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element,
        data: input.scopedContext
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ 
            type: "log", data: { message: "Event created (M)",  data: { elementId: context.element.id, position: context.element.position, data: context.data } 
        }}))
    ],
    states: {
        idle: {
            on: {
                activate: [{
                    target: "activated",
                    actions: [
                        // assign({ data: ({ event }) => event.data }),
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Event activated (M)",  data: { elementId: context.element.id, position: context.element.position, data: event.data } }}))
                    ]
                }],
                raise: {
                    target: "activated",
                    actions: [
                        assign({ data: ({ event }) => event.data }),
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Event raised (M)",  data: { elementId: context.element.id, position: context.element.position, data: event.data, contextData: context.data } }}))
                    ]
                }
            }
        },
        activated: {
            always: [
                {
                    guard: ({ context }) => context.element.position === Constants.START_EVENT,
                    target: "occured",
                    actions: [
                        sendParent(({ context }) => ({ type: "context.add", data: { output: context.element.output, input: context.data } })),
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Event occured (M)",  data: { elementId: context.element.id, position: context.element.position } }})),
                    ]
                },
                {
                    guard: ({ context }) => context.element.position === Constants.BOUNDARY_EVENT,
                    target: "occured",
                    actions: [
                        sendParent(({ context }) => ({ 
                            type: "event.occured", data: { name: context.element.name || context.element.localId, payload: context.data } 
                        })),
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Event occured (M)",  data: { elementId: context.element.id, position: context.element.position } }})),
                    ]
                },
                {
                    guard: ({ context }) => context.element.position === Constants.END_EVENT,
                    target: "occured",
                    actions: [
                        sendParent(({ context }) => ({ 
                            type: "event.occured", data: { name: context.element.name || context.element.localId, payload: context.data } 
                        })),
                        sendParent(({ context }) => ({
                            type: "log", data: { message: "Event occured (M)",  data: { elementId: context.element.id, position: context.element.position } }
                        })),
                        sendParent(({ context, self }) => ({ 
                            type: "activate.next", data: { elementId: context.element.id, sender: self }
                        }) )
                    ]
                }
            ],
        },
        error: {
            type: "final"
        },
        occured: {
            type: "final"
        }
    }
};

module.exports = {
    EventMachine
};
