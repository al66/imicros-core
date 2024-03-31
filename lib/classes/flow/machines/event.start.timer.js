/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const { v4: uuid } = require("uuid");

const TimerStartEventMachine = {
    id: "event",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ 
            type: "log", data: { message: "Timer start event created (M)",  data: { elementId: context.element.id, position: context.element.position, data: context.data } 
        }}))
    ],
    states: {
        idle: {
            on: {
                activate: [{
                    guard: ({ context }) => context.element.timer.type === Constants.TIMER_CYCLE,
                    target: "activated",
                    actions: [
                        sendParent(({ context }) => ({ type: "timer.schedule", data: { timer: context.element.timer, current: Date.now() } })),
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Timer start event activated (M)",  data: { elementId: context.element.id, position: context.element.position, timer: context.element.timer } }}))
                    ]
                },{
                    target: "activated",
                    actions: [
                        sendParent(({ context, event }) => ({ type: "log", data: { message: "Timer start event activated (M)",  data: { elementId: context.element.id, position: context.element.position, timer: context.element.timer } }}))
                    ]
                }]
            }
        },
        activated: {
            always: [
                {
                    target: "occured",
                    actions: [
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Timer start event occured (M)",  data: { elementId: context.element.id, position: context.element.position } }})),
                    ]
                }
            ],
        },
        occured: {
            type: "final"
        }
    }
};

module.exports = {
    TimerStartEventMachine
};
