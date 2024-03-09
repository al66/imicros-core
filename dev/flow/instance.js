const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, spawn, spawnChild, stopChild, enqueueActions } = require('xstate');

const { EventMachine } = require("./event");
const { SequenceMachine } = require("./sequence");
const { TaskMachine } = require("./task");
const { Constants } = require("../../lib/classes/util/constants");

const { Interpreter } = require("imicros-feel-interpreter");
const feel = new Interpreter();

const InstanceMachine = {
    id: "instance",
    initial: 'created',
    context: ({ }) => ({ 
        instanceData:{ active: [], completed: false },
        data: {},
        childs: {},
    }),
    predictableActionArguments: true,
    entry: [

    ],
    states: {
        created: { 
            after: { 
                30000: {
                    target: 'stopped',
                    actions: [
                        raise({ type: "log", data: { message: "Instance timeout" }})/*,
                        assign(({ context }) => { return { childs: {} }}) */
                    ]
                }
            },
            on: { 
                load: {
                    target: 'loadProcess',
                    actions: [
                        assign({ processId: ({ event }) => event.processId }),
                        assign({ versionId: ({ event }) => event.versionId }),
                        assign({ instanceId: ({ event }) => event.instanceId })
                    ]
                }
            }
        },

        loadProcess: {
            invoke: {
                src: "loadProcess",
                input: ({ context: { processId, versionId } }) => ({ processId, versionId }),
                onDone: {
                    target: "loaded",
                    actions: [
                        // ({ context, event }) => console.log("process loaded", event),
                        assign({ processData: ({ event }) => event.output?.processData })
                    ]
                }
            }
        },

        loaded: {
            always: [{
                guard: ({ context }) => context.instanceData.completed === true,
                target: "completed",
                actions: [
                    raise({ type: "log", data: { message: "Instance already completed" }})
                ]
            },{
                guard: ({ context }) => context.instanceData.active.length === 0,
                target: "running",
                actions: [
                    raise({ type: "log", data: { message: "New instance" }})/*,
                    raise({ type: "activate.default" })*/
                ]
            },{
                target: "running",
                actions: [
                    raise({ type: "log", data: { message: "Continue instance" }})
                ]
            }],
            on: { 
                stop: {
                    target: 'completed'
                }
            }
        },

        running: { 
            after: { 
                30000: {
                    target: 'stopped',
                    actions: [
                        raise({ type: "log", data: { message: "Instance timeout" }})/*,
                        assign(({ context }) => { return { childs: {} }})*/
                    ]
                }
            },
            on: {
                stop: {
                    target: 'stopped',
                    actions: [
                        raise({ type: "log", data: { message: "Instance stopped" }})
                    ] 
                },
                complete: {
                    target: 'completed',
                    actions: [
                        raise({ type: "log", data: { message: "Instance completed" }})
                    ] 
                }
            }
        },
        stopped: { 
            on: {
                continue: {
                    target: 'running',
                    actions: [
                        raise({ type: "log", data: { message: "Instance continued" }})
                    ]
                }
            }
         },
        completed: { type: "final" }
    },
    on: {
        "raise.event": {
            actions: [
                ({context, event, self}) => {
                    // search in events
                    let element = context.processData.event.find(evnt => evnt.name === event.data.eventName);
                    if (element) {
                        self.send({ type: "activate.element", data: { id: element.id, machine: EventMachine, element, data: event.data.payload }});
                    }                                                
                }
            ]
        },
        "activate.default": {
            actions: [
                ({context, self}) => {
                    // search in events
                    let element = context.processData.event.find(event => event.position === Constants.START_EVENT && event.type === Constants.DEFAULT_EVENT);
                    if (element) {
                        self.send({ type: "activate.element", data: { id: element.id, machine: EventMachine, element, data: {} }});
                    }                                                
                }
            ]
        },
        "activate.next": {
            actions: [
                // get next element
                ({context, event, self}) => {
                    if (!event.data?.elementId) {
                        return;
                    }
                    let next = [];
                    // search in sequences
                    let element = context.processData.sequence.find(sequence => sequence.id === event.data.elementId);
                    // search in tasks
                    if (!element) element = context.processData.task.find(task => task.id === event.data.elementId);
                    // search in events
                    if (!element) element = context.processData.event.find(evnt => evnt.id === event.data.elementId);
                    // search in gateways
                    if (!element) element = context.processData.gateway.find(gateway => gateway.id === event.data.elementId);
                    // TODO: sub process, call activity, transaction
            
                    // sequence
                    if (element.type === Constants.SEQUENCE_STANDARD || element.type === Constants.SEQUENCE_CONDITIONAL ) {
                        if (element.toId) next.push(element.toId);
                    // task, event or gateway
                    } else {
                        if (Array.isArray(element.outgoing)) next = next.concat(element.outgoing);
                    };
            
                    // map id to element
                    next = next.map(id => {
                        // search in sequences
                        let element = context.processData.sequence.find(sequence => sequence.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: SequenceMachine, element, data: {} }});    
                        }
                        // search in tasks
                        element = context.processData.task.find(task => task.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: TaskMachine, element, data: {} }});    
                        }
                        // search in events
                        element = context.processData.event.find(evnt => evnt.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: EventMachine, element, data: {} }});    
                        }
                        // search in gateways
                        element = context.processData.gateway.find(gateway => gateway.id === id);
                        //if (element) return new Gateway({ process: this, element})
                        // TODO: sub process, call activity, transaction
                        return null;
                    });

                    // no further elements
                    if (next.length === 0) self.send({ type: "check.completed" });
                },
                raise(({ event }) => ({ type: "deactivate.element", data: { elementId: event.data.elementId  }}))
            ]
        },
        "activate.element": {
            actions: [
                assign(({context, spawn, event, self}) => {
                    // console.log("spawn machine", event.data.machine);
                    const machine = createMachine(event.data.machine, { inspect: self.inspect });
                    // console.log("spawn", event.data.element);
                    spawn(machine, { id: event.data.id, input: { element: event.data.element } });
                    // spawn(machine, { id: event.data.id, input: { element: event.data.element } })
                    context.childs[event.data.id] = event.data.id;
                    return { childs: context.childs }
                }),
                sendTo(({ event }) => event.data.id, ({ event }) => ({ type: "activate", data: event.data.data }))
            ]
        },

        "deactivate.element": {
            actions: [
                stopChild(({event}) => event.data.elementId),
                assign(({ context, event} ) => delete context.childs[event.data.elementId]),
                raise(({ event }) => ({ type: "log", data: { message: "Actor stopped",  data: { elementId: event.data.elementId  } }}))
            ]
        },
        "context.add": {
            actions: [
                assign(({ context, event }) => { 
                    if (event.data.output) {
                        // io mapping with feel expression
                        event.data.output.forEach(output => {
                            context.data[output._target] = feel.evaluate(output._source.substr(1),event.data.input);
                            console.log("context", { key: output._target, value: context.data[output._target], source: output._source, context: event.data.input });
                        });
                    } else {
                        context.data[event.data.key] = event.data.value; return { data: context.data } 
                    };
                }),
                raise(({ event }) => ({ type: "log", data: { message: "Context added",  data: { key: event.data.key, value: event.data.value } }}))
            ] 
        },
        "schedule.job": {
            actions: [
                raise(({ event }) => ({ type: "log", data: { message: "Schedule job",  data: event.data.data }}))
            ]
        },
        "check.completed": {
            actions: [
                ({context, self}) => {
                    // console.log(self);
                    if (Object.keys(context.childs).length === 0) {
                        self.send({ type: "complete" });
                    }
                }
            ]   
        },
        "commit"    : {
            actions: [
               raise(({ context, event, self }) => ({ type: "log", data: { message: "commit reseived",  data: { id: event.data.id } }})),
               sendTo(({ context, event }) => event.data.id, ({ context, event }) => ({ type: "commit" }))
            ]
        },
        "log": {
            actions: [
                { type: "log", params: ({ context, event }) => ({ context, event })}
            ]
        }
    }
};

module.exports = {
    InstanceMachine
};