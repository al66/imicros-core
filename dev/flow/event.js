const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise } = require('xstate');
const { Constants } = require("../../lib/classes/util/constants");

const EventMachine = {
    id: "event",
    initial: "idle",
    context: ({ input }) => ({ 
        element: input.element,
        instance: input.instance
    }),
    predictableActionArguments: true,
    entry: [
        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Event created (M)",  data: { elementId: context.element.id, position: context.element.position } }}))
    ],
    states: {
        idle: {
            on: {
                activate: {
                    target: "activated",
                    actions: [
                        assign({ data: ({ event }) => event.data }),
                        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Event activated (M)",  data: { elementId: context.element.id, position: context.element.position } }}))
                    ]
                }
            }
        },
        activated: {
            always: [
                {
                    guard: ({ context }) => context.element.position === Constants.START_EVENT || context.element.position === Constants.END_EVENT,
                    target: "occured",
                    actions: [
                        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "context.add", data: { key: context.element.name, value: context.data } })),
                        sendTo(({ context }) => context.instance, ({ context, self }) => ({ type: "activate.next", data: { elementId: context.element.id, sender: self }}) ),
                        sendTo(({ context }) => context.instance, ({ context }) => ({ type: "log", data: { message: "Event occured (M)",  data: { elementId: context.element.id, position: context.element.position } }})),
                    ]
                },
            ],
        },
        occured: {
            type: "final"
        }
    }
};

module.exports = {
    EventMachine
};
