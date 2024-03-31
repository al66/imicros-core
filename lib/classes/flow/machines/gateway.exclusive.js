/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const ExclusiveGatewayMachine = {
    id: "gateway",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ 
            type: "log", data: { message: "Exclusive Gateway created (M)",  data: { elementId: context.element.id, type: context.element.type } 
        }}))
    ],
    states: {
        idle: {
            on: {
                activate: [{
                    target: "activated",
                    actions: [
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Exclusive Gateway activated (M)",  data: { elementId: context.element.id, type: context.element.type, previous: event.data.previous } }}))                        
                    ]
                }]
            }
        },
        activated: {
            always: [
                {
                    // activate first outgoing, where condition evaluates to true, otherwise the default
                    guard: ({ context }) => context.element.outgoing.length > 1,
                    target: "completed",
                    actions: [
                        sendParent(({ context, self }) => ({ type: "conditional.next", data: { elementId: context.element.id, outgoing: context.element.outgoing, default: context.element.default }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Exclusive Gateway completed (M)",  data: { elementId: context.element.id, type: context.element.type } }}))
                    ]
                },{
                    // activate the only outgoing
                    guard: ({ context }) => context.element.outgoing.length === 1,
                    actions: [
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Exclusive Gateway completed (M)",  data: { elementId: context.element.id, type: context.element.type } }})),
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
    ExclusiveGatewayMachine
};
