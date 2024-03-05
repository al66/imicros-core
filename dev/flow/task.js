const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise } = require('xstate');
const { Constants } = require("../../lib/classes/util/constants");

const TaskMachine = {
    id: "task",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element,
        instance: input.instance
    }),
    predictableActionArguments: true,
    entry: [
        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Task created",  data: { elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        description: "simple tasks are passed through",
                        guard: ({ context }) => context.element.type === Constants.TASK,
                        target: "activated",
                        actions: [
                            sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Task activated",  data: { elementId: context.element.id, type: context.element.type } }}))
                        ]
                    }
                ]
            }
        },
        activated: {
            always: [
                {
                    target: "completed",
                    actions: [
                        sendTo(({ context }) => context.instance, ({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Task completed",  data: { elementId: context.element.id, type: context.element.type } }})),
                    ]
                },
            ],
        },
        completed: {
            type: "final"
        }
    }
};

module.exports = {
    TaskMachine
};
