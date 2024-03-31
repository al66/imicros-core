/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const GatewayMachine = {
    id: "gateway",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ 
            type: "log", data: { message: "Gateway w/o implementation created (M)",  data: { elementId: context.element.id, type: context.element.type } 
        }}))
    ],
    states: {
        idle: {
            on: {
                activate: [{
                    target: "activated",
                    actions: [
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Gateway w/o implementation activated (M)",  data: { elementId: context.element.id, type: context.element.type, previous: event.data.previous } }}))
                    ]
                }]
            }
        },
        activated: {
            always: [
                {
                    // not implemented gateway type: pass through
                    target: "completed",
                    actions: [
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Gateway w/o implementation completed (M)",  data: { elementId: context.element.id, type: context.element.type } }})),
                    ]
                }
            ]
        },
        completed: {
            type: "final"
        }
    }
};

module.exports = {
    GatewayMachine
};
