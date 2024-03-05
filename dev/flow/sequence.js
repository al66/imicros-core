const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise } = require('xstate');
const { Constants } = require("../../lib/classes/util/constants");

const SequenceMachine = {
    id: "sequence",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element,
        instance: input.instance
    }),
    predictableActionArguments: true,
    entry: [
        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Sequence created",  data: { elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        guard: ({ context }) => context.element.type === Constants.SEQUENCE_STANDARD,
                        target: "activated",
                        actions: [
                            sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Sequence activated",  data: { elementId: context.element.id, type: context.element.type } }}))
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
                        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Sequence completed",  data: { elementId: context.element.id, type: context.element.type } }})),
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
    SequenceMachine
};
