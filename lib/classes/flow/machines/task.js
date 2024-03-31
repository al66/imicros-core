/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');

const TaskMachine = {
    id: "task",
    initial: "idle",
    context: ({ input }) => ({ 
        instanceId : input.instanceId,
        element: input.element,
        data: input.scopedContext
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context, self }) => ({ type: "log", data: { message: "Task created",  data: { id: self.id, elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        target: "activated",
                        actions: [
                            sendParent(({ context }) => ({ type: "log", data: { message: "Task activated",  data: { elementId: context.element.id, type: context.element.type } }}))
                        ]
                    }
                ]
            }
        },
        activated: {
            always: [
                {
                    description: "simple tasks are passed through",
                    target: "completed",
                    actions: [
                        sendParent(({ context }) => ({ type: "activate.next", data: { elementId: context.element.id }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Task comitted",  data: { elementId: context.element.id, type: context.element.type } }}))
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
    TaskMachine
};
