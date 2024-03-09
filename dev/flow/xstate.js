const { setTimeout } = require("timers/promises");
const { setup, createMachine, createActor, fromPromise, assign, raise, sendTo, spawn, spawnChild, stopChild, enqueueActions, waitFor, toPromise } = require('xstate');

const { InstanceMachine } = require("./instance");
const { Constants } = require("../../lib/classes/util/constants");

const { Interpreter } = require("imicros-feel-interpreter");

// temp
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../lib/classes/flow/parser");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const { send } = require('process');
const { actions } = require('../../lib/services/flow');
const { set } = require("../../lib/modules/util/lodash");
const util = require('util')

class Process {
    constructor({ logger }) {
        this.logger = logger;
    
        // Stateless machine definition
        this.instanceMachine = this.createProcessMachine();

        // temp... events
        this.events = [];

        // feel interpreter
        this.feel = new Interpreter();

    }

    createProcessMachine() {
        const main = this;
        return setup({
            actors: {
                // async instance functions
                loadProcess: fromPromise(this.loadProcess.bind(this)),
                loadInstance: fromPromise(this.loadInstance.bind(this)),
                persist: fromPromise(this.persist.bind(this))
            },
            actions: {
                log: (_, { context, event }) => this.logger.debug.bind(this)(event.data.message,{ value: main.instanceActor.getSnapshot().value, ...event.data.data })
            }
        }).createMachine(InstanceMachine, { systemId: uuid(), inspect: this.inspect.bind(this) });
    }

    create(snapshot = null) {
        this.instanceActor = createActor(this.instanceMachine, { inspect: this.inspect.bind(this), snapshot });
        return this.instanceActor;
    }

    init() {
        delete this.instanceActor;
        this.events = [];
    }

    inspect(inspectionEvent) {
        this.events.push(inspectionEvent);
    }

    async logEvents(log = false) {
        const events = JSON.parse(JSON.stringify(this.events));
        if (log) {
            for (const event of events) {
                let other = "";
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
        return events;
    }

    rebuild(instance, events) {
        for (const event of events) {
            if (event.type === '@xstate.event') {
                //console.log("Event",util.inspect(event, {showHidden: false, depth: null, colors: true}));
                if (event.actorRef === event.rootId) {
                    instance.send(event.event);
                } else {
                    switch (event.event.type) {
                        case 'activate.element':
                            // must be ignored! element is already spawned by xstate.init event
                            break;
                        default:
                            instance.send(event.event);
                    }
                }
            }
        }
    }

    /*********************************************************
     * Async forms -> Actors 
     *********************************************************/

    async loadProcess({ input }) {
        this.logger.debug("Load process", input );

        const parser = new Parser({ logger: this.logger });
        const xmlData = fs.readFileSync("assets/Process A zeebe.bpmn");
        const parsedData = parser.parse({id: uuid(), xmlData, objectName: "Process Example", ownerId: uuid()});
        console.log(util.inspect(parsedData, {showHidden: false, depth: null, colors: true}));
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

}

const Service = {
    name: "xstate",

    methods: {
        async run() {
            this.process.init();
            const instance = this.process.create();
            instance.start();

            // console.log(instance);
            instance.send({ type: 'load', processId: 'A', versionId: '1', instanceId: null });
            await waitFor(instance, (state) => state.value === "running");
            instance.send({ type: "raise.event", data: { eventName: "Order placed", payload: { id: "123" } } });
            // const output = await waitFor(instance, (state) => state.value === "stopped" || state.value === "completed");
            await setTimeout(1000);
            const snapshot = instance.getPersistedSnapshot();
            instance.stop();
            const events = await this.process.logEvents();

            this.logger.debug("Done: frist run");
            return { events, snapshot };
        },

        async reRun({ events, snapshot }) {
            this.logger.debug("Start instance again");
            this.process.init();
            //console.log("childs", snapshot.context.childs);
            //console.log("children", snapshot.children);
            const instance = this.process.create();
            instance.start();
            snapshot = instance.getSnapshot();
            this.logger.debug("Status after start", snapshot.value);

            // Rebuild
            this.process.rebuild(instance, events);

            const snapshot2 = instance.getSnapshot();
            this.logger.debug("Status after rebuild", snapshot2.value);
            //console.log("childs", snapshot.context.childs);
            //console.log("children", snapshot.children);
            //console.log(util.inspect(snapshot, {showHidden: false, depth: null, colors: true}))

            if (snapshot2.value === "running") instance.send({ type: "commit", data: { id: Object.keys(snapshot.context.childs)[0], data: { order: "12345" } } });
            //if (snapshot2.value === "running") sendTo(Object.keys(snapshot.context.childs)[0], { type: "commit" });

            await setTimeout(1000);
            snapshot = instance.getSnapshot();
            instance.stop();
            events = await this.process.logEvents();
            this.logger.debug("Status after rerun", snapshot.value);

            this.logger.debug("Done: second Run");
            return { events, snapshot };
        }
    },

    async created () {
        this.logger.debug("Service created");
        this.process = new Process({ logger: broker.logger  });
    },

    async started () {
        let result = await this.run();   
        result = await this.reRun(result);
        // result = await this.reRun(result);
    }
};

const broker = new ServiceBroker({
    logger: console,
    logLevel: "debug", // "info" //"debug"
});

// create instance and start
async function run () {
    broker.createService(Service);
    await broker.start();
    await setTimeout(3000);
    await broker.stop();

}

run();

