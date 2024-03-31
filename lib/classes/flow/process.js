/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, raise, sendTo, spawn, spawnChild, stopChild, enqueueActions, waitFor, toPromise } = require('xstate');
const { InstanceMachine } = require("./instance");

class Process {
    constructor({ logger }) {
        this.logger = logger;
    
        // Stateless machine definition
        this.instanceMachine = this.createProcessMachine();

        // temp... events
        this.events = [];

        // feel interpreter
        // this.feel = new Interpreter();

    }

    createProcessMachine() {
        const main = this;
        return setup({
            actors: {
                // async instance functions
            },
            actions: {
                // log: (_, { context, event }) => this.logger.debug.bind(this)(event.data.message,{ value: main.instanceActor.getSnapshot().value, ...event.data.data })
            }
        }).createMachine(InstanceMachine, { inspect: this.inspect.bind(this) });
    }

    create({ events = [], snapshot = null } = {}) {
        this.events = events;
        const systemId = "instance";
        this.instanceActor = createActor(this.instanceMachine, { id: systemId, systemId: systemId, inspect: this.inspect.bind(this), snapshot });
        return this.instanceActor;
    }

    async raiseEvent({ eventName, payload, processData, snapshot, instanceId }) {
        const machine = createMachine(InstanceMachine, { });
        const systemId = "instance";
        const instance = createActor(machine, { id: systemId, systemId: systemId, snapshot });
        instance.start();
        instance.send({ type: "continue" });
        instance.send({ type: 'load', processData, instanceId });
        await waitFor(instance, (state) => state.value === "running");
        instance.send({ type: "raise.event", data: { eventName, payload } });
        await waitFor(instance, (state) => state.value === "stopped" || state.value === "completed");
        snapshot = instance.getPersistedSnapshot();
        instance.stop();
        return { snapshot };
    }

    async commitJob({ jobId, result, snapshot }) {
        const machine = createMachine(InstanceMachine, { });
        const systemId = "instance";
        const instance = createActor(machine, { id: systemId, systemId: systemId, snapshot });
        instance.start();
        instance.send({ type: "continue" });
        await waitFor(instance, (state) => state.value === "running");
        instance.send({ type: "commit", data: { id: jobId, data: { result } }});
        await waitFor(instance, (state) => state.value === "stopped" || state.value === "completed");
        snapshot = instance.getPersistedSnapshot();
        instance.stop();
        return { snapshot };
    }

    async failedJob({ jobId, error, snapshot }) {
        const machine = createMachine(InstanceMachine, { });
        const systemId = "instance";
        const instance = createActor(machine, { id: systemId, systemId: systemId, snapshot });
        instance.start();
        instance.send({ type: "continue" });
        await waitFor(instance, (state) => state.value === "running");
        instance.send({ type: "failed", data: { id: jobId, data: { error } }});
        await waitFor(instance, (state) => state.value === "stopped" || state.value === "completed");
        snapshot = instance.getPersistedSnapshot();
        instance.stop();
        return { snapshot };
    }

    /**
     * Only relevent for event sourcing, which is not implemented yet
     * 
     * @param {*} inspectionEvent 
     */
    inspect(inspectionEvent) {
        this.events.push(inspectionEvent);
    }

    /**
     * Only relevent for event sourcing, which is not implemented yet
     * 
     * @param {*} log           true if events should be logged by logger
     * @returns [xstate event]  collected xstate events (logged by inspection)
     */
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

    /**
     * Doesn't work yet
     * We cannot really replay events, because we cannot distinguish between commands and events
     * e.g. 
     *      Scheduling a new job requires 
     *             -    first the creation of a unique id (not to be raplayed, because it is a command and would create a new id every time we replay the scheduling)
     *             -    creating the job (called by the first step)
     *             -    and then the queueing of the job
     *      if we replay the scheduling, we would create a new id and queue the job again, 
     *      if we ignore this event, we would miss the job if the instance is stopped between creating the new id and queueing the job
     *      we would at least separate each called action in actions, which changes the contaxt or state value and actions which 
     *      are calling other functions or services
     *      if we look at the logged events of xstate, we can see that this a mixture of both and events like state changes are not
     *      fired by the machine itself. We need to replay the command to fulfill the state change.
     * 
     * @param {*} instance 
     * @param {*} events 
     */
    rebuild(instance, events) {
        for (const event of events) {
            if (event.type === '@xstate.event') {
                event.event.replay = true;
                switch (event.event.type) {
                    case 'activate.element':
                        break;
                    default:
                        // console.log("Event",util.inspect(event, {showHidden: false, depth: null, colors: true}));
                        instance.send(event.event);
                }
            }
        }
    }

}

module.exports = {
    Process
};
