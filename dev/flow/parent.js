"use strict";

const { createMachine, assign } = require('xstate');

const { ChildMachine } = require("./child");

const ParentMachine = {
    id: "parent",
    initial: "idle",
    context: {
        count: 0,
        child: null
    },
    entry: [
        ({ context }) => console.log("ParentMachine created", context)
    ],
    states: {
        idle: {
            on: {
                start: {
                    target: "running",
                    actions: [
                        assign(({ spawn, event }) => { 
                            const machine = createMachine(ChildMachine);
                            const id = event.childId;
                            const child = spawn(machine, { id, systemId: id });                            
                            return { child };
                        })
                    ]
                }
            }
        },
        running: {
            on: {
                tick: {
                    actions: [
                        assign({ count: ctx => ctx.count + 1 }),
                        ({ system, event }) => {
                            console.log("ParentMachine tick", { event });
                            const child = system.get(event.id);
                            if (child) child.send(event);
                       }
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
    ParentMachine
};