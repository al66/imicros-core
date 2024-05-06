"use strict";

const { assign } = require('xstate');

const ChildMachine = {
    initial: "running",
    context: {
        count: 0
    },
    entry: [
        ({ context }) => console.log("ChildMachine created", context)
    ],
    states: {
        running: {
            on: {
                tick: {
                    actions: [
                        assign({ count: ({ context }) => (context.count + 1) }),
                        ({ event }) => console.log("ChildMachine tick", event)
                    ]
                },
                stop: {
                    target: "final"
                }
            }
        },
        final: {
            type: "final"
        }
    }
};

module.exports = {
    ChildMachine
};
