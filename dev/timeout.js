const { setTimeout } = require("timers/promises");
const { setup, createMachine, createActor, fromPromise, assign, raise, sendTo, spawn, spawnChild, stopChild, enqueueActions } = require('xstate');

const ChildMachine = {
    id: "child",
    initial: "idle",
    states: {
        idle: {
            on: {
                start: {
                    target: "running"
                }
            }
        },
        running: {
            on: {
                stop: {
                    target: "stopped"
                }
            }
        },
        stopped: {
            type: "final"
        }
    }
}

const Machine = {
    id: "instance",
    initial: 'created',
    states: {
        created: {
            on: {
                start: {
                    target: "running",
                    actions: [
                        () => console.log("start child"),
                        assign(({ spawn }) => { 
                            const childMachine = createMachine(ChildMachine);
                            spawn(childMachine, { id: "child" })
                            
                        }),
                        sendTo("child", { type: "start" })
                    ]
                }
            }
        },
        running: {
            on: {
                stop: {
                    target: "stopped"
                }
            }
        },
        stopped: {
            always: {
                actions: [
                    () => console.log("stopped")
                ]
            },
            type: "final"
        }
    }
}


async function run () {
    console.log("start");  
    const machine = createMachine(Machine); 
    const actor = createActor(machine);
    actor.start();
    actor.send({ type: "start" });
    //actor.send({ type: "stop" });
    await setTimeout(3000);
    let snapshot = actor.getPersistedSnapshot();
    snapshot = JSON.parse(JSON.stringify(snapshot));
    actor.stop();
    console.log("first run done");   
    const actor2 = createActor(machine,{ snapshot });
    actor2.start();
    snapshot = actor2.getSnapshot();
    console.log(snapshot.children.child.getSnapshot());

    actor2.stop();
}

run();
