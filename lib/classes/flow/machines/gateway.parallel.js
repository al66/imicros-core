/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const ParallelGatewayMachine = {
    id: "gateway",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ 
            type: "log", data: { message: "Parallel Gateway created (M)",  data: { elementId: context.element.id, type: context.element.type } 
        }}))
    ],
    states: {
        idle: {
            on: {
                activate: [{
                    target: "activated",
                    actions: [
                        assign(({ context, event }) => {
                            if  (!context.incoming)  {
                                context.incoming = [event.data.previous];
                            } else if (context.incoming.indexOf(event.data.previous) === -1) {
                                context.incoming.push(event.data.previous);
                            }
                            return { incoming: context.incoming };
                        }),
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Parallel Gateway activated (M)",  data: { elementId: context.element.id, type: context.element.type, previous: event.data.previous } }}))
                    ]
                }]
            }
        },
        activated: {
            always: [
                {
                    // wait for all incoming, activate all outgoing
                    guard: ({ context }) => context.incoming.length === context.element.incoming.length,
                    target: "completed",
                    actions: [
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Parallel Gateway completed (M)",  data: { elementId: context.element.id, type: context.element.type } }})),
                    ]
                }
            ],
            on: {
                activate: [{
                    target: "activated",
                    actions: [
                        assign(({ context, event }) => {
                            if  (!context.incoming)  {
                                context.incoming = [event.data.previous];
                            } else if (context.incoming.indexOf(event.data.previous) === -1) {
                                context.incoming.push(event.data.previous);
                            }
                            return { incoming: context.incoming };
                        }),
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Parallel Gateway activated (M)",  data: { elementId: context.element.id, type: context.element.type, previous: event.data.previous } }}))
                    ]
                }]
            }
        },
        completed: {
            type: "final"
        }
    }
};

module.exports = {
    ParallelGatewayMachine
};
