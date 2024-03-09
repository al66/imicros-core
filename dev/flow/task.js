const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../lib/classes/util/constants");

const TaskMachine = {
    id: "task",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ type: "log", data: { message: "Task created",  data: { elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        target: "activated",
                        actions: [
                            assign({ data: ({ event }) => event.data }),
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
                    guard: ({ context }) => context.element.type === Constants.TASK,
                    actions: [
                        raise({ type: "commit" })
                    ]
                },
                {
                    description: "schedule job for service tasks ",
                    guard: ({ context }) => context.element.type === Constants.SERVICE_TASK,
                    actions: [
                        sendParent(({ context, event }) => ({ type: "schedule.job", data: { elementId: context.element.id, type: context.element.type, data: event.data } })),
                    ]
                }
            ],
            on: {
                commit: {
                    target: "completed",
                    actions: [
                        sendParent(({ context }) => ({ type: "activate.next", data: { elementId: context.element.id }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Task comitted",  data: { elementId: context.element.id, type: context.element.type } }}))
                    ]
                }
            }
        },
        completed: {
            type: "final"
        }
    }
};

module.exports = {
    TaskMachine
};
