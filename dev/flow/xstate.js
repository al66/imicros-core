const { setup, createMachine, createActor, fromPromise, assign, raise, sendTo, spawn, spawnChild, stopChild, enqueueActions } = require('xstate');

const { EventMachine } = require("./event");
const { SequenceMachine } = require("./sequence");
const { TaskMachine } = require("./task");
const { Constants } = require("../../lib/classes/util/constants");

// temp
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../lib/classes/flow/parser");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const { send } = require('process');
const broker = new ServiceBroker({
    logger: console,
    logLevel: "debug" // "info" //"debug"
});
const parser = new Parser({ broker });
const xmlData = fs.readFileSync("assets/Process A zeebe.bpmn");
const parsedData = parser.parse({id: uuid(), xmlData, objectName: "Process Example", ownerId: uuid()});

class Process {
    constructor({ logger }) {
        this.logger = logger;
    
        // Stateless machine definition
        this.instanceMachine = this.createProcessMachine();

        // temp... events
        this.events = [];

    }

    createProcessMachine() {
        const main = this;
        return setup({
            actors: {
                // async instance functions
                loadProcess: fromPromise(this.loadProcess.bind(this)),
                loadInstance: fromPromise(this.loadInstance.bind(this)),
                persist: fromPromise(this.persist.bind(this)),
                processToken: fromPromise(this.processToken.bind(this))
            },
            actions: {
                // activateDefault: (_, { instance, processData }) => this.activateDefault.bind(this)({ instance, processData }),
            }
        }).createMachine({
            id: "instance",
            initial: 'created',
            context: ({ self }) => ({ 
                instance: self,
                data: {},
                childs: {},
            }),
            predictableActionArguments: true,
            states: {
                created: { 
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
                            target: "loadInstance",
                            actions: [
                                // ({ context, event }) => console.log("process loaded", event),
                                assign({ processData: ({ event }) => event.output?.processData })
                            ]
                        }
                    }
                },

                loadInstance: {
                    invoke: {
                        src: "loadInstance",
                        input: ({ context: { instanceId } }) => ({ instanceId }),
                        onDone: {
                            target: "loaded",
                            actions: assign({ instanceData: ({ event }) => event.output?.instanceData })
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
                            raise({ type: "log", data: { message: "New instance" }}),
                            raise({ type: "activate.default" })
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
                        1000: {
                            target: "persist",
                        }
                    },
                    on: {
                        stop: {
                            target: 'persist',
                            actions: [
                                raise({ type: "log", data: { message: "Instance stopped" }})
                            ] 
                        },
                        complete: {
                            target: 'persist',
                            actions: [
                                raise({ type: "log", data: { message: "Instance completed" }})
                            ] 
                        }
                    }
                },

                persist: {
                    invoke: {
                        src: "persist",
                        onDone: {
                            target: "stopped"
                        }
                    }
                },
                stopped: { type: "final" },
                completed: { type: "final" }
            },
            on: {
                "activate.default": {
                    actions: [
                        ({context, self}) => {
                            // search in events
                            let element = context.processData.event.find(event => event.position === Constants.START_EVENT && event.type === Constants.DEFAULT_EVENT);
                            if (element) {
                                const eventMachine = createMachine(EventMachine,{ inspect: main.inspect.bind(main) });
                                context.instance.send({ type: "activate.element", data: { id: element.id, machine: eventMachine, element, data: { order: "5" } }});
                            }                                                
                        }
                    ]
                },
                "activate.next": {
                    actions: [
                        // get next element
                        ({context, event}) => {
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
                                    return context.instance.send({ type: "activate.element", data: { id: element.id, machine: createMachine(SequenceMachine), element, data: {} }});    
                                }
                                // search in tasks
                                element = context.processData.task.find(task => task.id === id);
                                if (element) {
                                    return context.instance.send({ type: "activate.element", data: { id: element.id, machine: createMachine(TaskMachine), element, data: {} }});    
                                }
                                // search in events
                                element = context.processData.event.find(evnt => evnt.id === id);
                                if (element) {
                                    return context.instance.send({ type: "activate.element", data: { id: element.id, machine: createMachine(EventMachine), element, data: {} }});    
                                }
                                // search in gateways
                                element = context.processData.gateway.find(gateway => gateway.id === id);
                                //if (element) return new Gateway({ process: this, element})
                                // TODO: sub process, call activity, transaction
                                return null;
                            });

                            // no further elements
                            if (next.length === 0) context.instance.send({ type: "check.completed" });
                        },
                        stopChild(({event}) => event.data.elementId),
                        assign(({ context, event} ) => delete context.childs[event.data.elementId]),
                        raise(({ event }) => ({ type: "log", data: { message: "Actor stopped",  data: { elementId: event.data.elementId  } }}))
                    ]
                },
                "activate.element": {
                    actions: enqueueActions(({ enqueue, context, event }) => {
                        if (!context.childs[event.data.id]) {
                            enqueue.assign(({context, spawn, event, self}) => {
                                context.childs[event.data.id] = spawn(event.data.machine, { id: event.data.id, input: { instance: self, element: event.data.element } })
                                return { childs: context.childs }
                            })
                        };
                        enqueue.sendTo(({ event }) => event.data.id, ({ event }) => ({ type: "activate", data: event.data.data }));
                    })
                },
                "context.add": {
                    actions: [
                        assign(({ context, event }) => { context.data[event.data.key] = event.data.value; return { data: context.data } }),
                        raise(({ event }) => ({ type: "log", data: { message: "Context added",  data: { key: event.data.key, value: event.data.value } }}))
                    ] 
                },
                "check.completed": {
                    actions: [
                        ({context}) => {
                            if (Object.keys(context.childs).length === 0) {
                                context.instance.send({ type: "complete" });
                            }
                        }
                    ]   
                },
                "log": {
                    actions: [
                        ({ context, event }) => this.logger.debug(event.data.message,{ value: context.instance.getSnapshot().value, ...event.data.data })
                    ]
                },
                "replay.start": {
                    actions: [
                        assign({ replay: true })
                    ]
                },
                "replay.done": {
                    actions: [
                        assign({ replay: false })
                    ]
                }
            }
        });
    }

    initActor() {
        if (!this.instanceActor) {
            this.instanceActor = createActor(this.instanceMachine, { inspect: this.inspect.bind(this) });
            // this.instanceActor.subscribe((snapshot) => console.log("Value",snapshot.value));
            this.instanceActor.start();
            /*
            this.instanceActor.send({ type: "replay.start" });
            for (const event of this.snapshot.events) {
                this.instanceActor.send(event);
            }
            this.instanceActor.send({ type: "replay.done" });
            */
        }
        return this.instanceActor;
    }

    inspect(inspectionEvent) {
        // console.log("Inspection", inspectionEvent);
        //if (inspectionEvent.type === '@xstate.event') {
            /*
            const replay = inspectionEvent.actorRef.getSnapshot()?.context?.replay || false;
            if (replay) { return; }
            const event = inspectionEvent.event;
            // Only listen for events sent to the root actor
            // if (inspectionEvent.actorRef !== someActor) { return; }
            this.snapshot.events.push(event);
            // console.log("Event", event);
            */
            if (inspectionEvent.actorRef !== this.instanceActor) { 
                // this.logger.warn("Inspection", inspectionEvent);
            }
            this.events.push(inspectionEvent);
        //} 
    }

    async run({ processId, versionId, instanceId }) {
        this.initActor();
        this.instanceActor.send({ type: 'load', processId, versionId, instanceId });
    }
    
    async stopped() {
        const self = this;
        return new Promise(resolve => {
            const waitFor = (value, status) => {
                if (value === status) {
                    resolve(self.instanceActor.getSnapshot());
                }
            }
            self.instanceActor.subscribe((snapshot) => { 
                waitFor(snapshot.value,"stopped");
                waitFor(snapshot.value,"completed");
            });
        });
    }

    async logEvents() {
        if (1 === 1) return;
        for (const event of this.events) {
            let other = "";
            if (event.actorRef !== this.instanceActor) { 
                other = "Other: ";
            }            
            switch (event.type) {
                case '@xstate.event':
                    this.logger.debug(`${ other }Event`,{  type: event.type, rootId: event.rootId, event: event.event });
                    break;
                case '@xstate.microstep':
                    this.logger.debug(`${ other }Event`,{  type: event.type, rootId: event.rootId, event: event.event  });
                    break;
                case '@xstate.actor':
                    this.logger.debug(`${ other }Event`,{  type: event.type, rootId: event.rootId });
                    break;
                case '@xstate.snapshot':
                    this.logger.debug(`${ other }Event`,{  type: event.type });    
                    break; 
                default:
                    this.logger.debug(`${ other }Event`,{  type: event.type });    
            }
        }
    }

    /*********************************************************
     * Async forms -> Actors 
     *********************************************************/

    async loadProcess({ input }) {
        this.logger.debug("Load process", input );
        // TODO
        return { processData: parsedData };
    }

    async loadInstance({ input: { instanceId }, self }) {
        this.logger.debug("Load instance", instanceId );
        // TODO create instance, if not exists

        // TODO load instance data
        const instanceData = { instanceId: instanceId, active: [], completed: false };
        return { instanceData };
    }

    async persist({ input }) {
        this.logger.debug("Persist process", input );
        // TODO
        return { result: "Done" };
    }

    async log({ message, data }) {
        this.logger.debug(message, data);
        // console.log("Log", message, elementId, subtype);
    }

    // process token
    async processToken({ input }) {
        console.log("Process Token", input );
        return  new Promise(resolve => setTimeout(resolve("Done"), 50));
    }
    
    async stop() {
        this.instanceActor.send({ type: 'stop' });
    }
}

// create instance and start
async function run () {
    let instance = new Process({ logger: broker.logger  });
    instance.run({ type: 'load', processId: 'A', versionId: '1' });
    let snapshot = await instance.stopped();
    await instance.logEvents();
    // console.log("Result", snapshot);

    /*
    instance = new Process({ logger: broker.logger });
    instance.run({ type: 'load', processId: 'A', versionId: '1', instanceId: 'A1' });
    snapshot = await instance.stopped();
    // console.log("Result", snapshot);
    */

}

run();

