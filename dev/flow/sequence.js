const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../lib/classes/util/constants");

const SequenceMachine = {
    id: "sequence",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element
    }),
    predictableActionArguments: true,
    entry: [
        sendParent(({ context }) => ({ type: "log", data: { message: "Sequence created",  data: { elementId: context.element.id, type: context.element.type } }}))
    ],
    states: {
        idle: {
            on: {
                activate: [
                    {
                        guard: ({ context }) => context.element.type === Constants.SEQUENCE_STANDARD,
                        target: "activated",
                        actions: [
                            sendParent(({ context }) => ({ type: "log", data: { message: "Sequence activated",  data: { elementId: context.element.id, type: context.element.type } }}))
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
                        sendParent(({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendParent(({ context }) => ({ type: "log", data: { message: "Sequence completed",  data: { elementId: context.element.id, type: context.element.type } }})),
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
