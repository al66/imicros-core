/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");
const { Interpreter } = require("imicros-feel-interpreter");

const BusinessRuleTaskMachine = {
    id: "task",
    initial: "idle",
    context: ({ input }) => ({ 
        instanceId : input.instanceId,
        element: input.element,
        data: input.scopedContext
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context, self }) => ({ type: "log", data: { message: "Business Rule Task created",  data: { id: self.id, elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        description: "evaluate business rule",
                        target: "activated",
                        actions: [
                            assign(({ context, event, self }) => {
                                const result = {};
                                const interpreter = new Interpreter();
                                // parsed ast is already available
                                if (interpreter.ast) {
                                    interpreter.ast = context.element.calledDecision.ast;
                                    result[context.element.calledDecision.resultVariable] = interpreter.evaluate({ context: context.data });
                                // only expression is available
                                } else if (context.element.calledDecision.expression) {
                                    result[context.element.calledDecision.resultVariable] = interpreter.evaluate({ expression: context.element.calledDecision.expression, context: context.data });
                                }
                                return { result };
                            }),
                            sendParent(({ context, event }) => ({ type: "log", data: { message: "Business Rule Task activated",  data: { elementId: context.element.id, type: context.element.type, input: context.data, result: context.result } }}))
                        ]
                    }
                ]
            }
        },
        waiting: {
            on: {
                evaluated: {
                    description: "business rule - add to context and activate next",
                    target: "completed",
                    actions: [
                        sendParent(({ context }) => ({ type: "context.add", data: { output: context.element.output, input: context.result } })),
                        sendParent(({ context }) => ({ type: "activate.next", data: { elementId: context.element.id }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Task comitted",  data: { elementId: context.element.id, type: context.element.type } }}))
                    ]
                }
            }
        },
        activated: {
            always: [
                {
                    description: "business rule - add to context and activate next",
                    target: "completed",
                    actions: [
                        sendParent(({ context }) => ({ type: "context.add", data: { output: context.element.output, input: context.result } })),
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
    BusinessRuleTaskMachine
};
