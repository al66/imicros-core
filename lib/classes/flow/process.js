/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, raise, sendTo, spawn, spawnChild, stopChild, enqueueActions, waitFor, toPromise } = require('xstate');
const { InstanceMachine } = require("./instance");
const { Constants } = require("../../../lib/classes/util/constants");
const { Interpreter } = require("imicros-feel-interpreter");
const { v4: uuid } = require("uuid");
const { Cycle } = require("../timer/cycle");
const crypto = require("crypto");

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

    /**
     * get initial subscriptions and timers from process
     * 
     * @param {Object} processData      parsed process data
     * 
     * @returns {Object}  { subscriptions: [{Object}], timers: [{Object}] }
     */
    getInitialEvents({ processData }) {
        // this.logger.info("Get subscriptions",{ processData });
        const result = { subscriptions: [], timers: [] };
        for (const event of processData.event) {
            if (event.position === Constants.START_EVENT) {
                switch (event.type) {
                    case Constants.DEFAULT_EVENT:
                        result.subscriptions.push({
                            subscriptionId: uuid(),
                            type: Constants.SUBSCRIPTION_TYPE_EVENT,
                            hash: this.getHash(event.localId || event.name),
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            correlation: null,
                            condition: null
                        });
                        break;
                    case Constants.MESSAGE_EVENT:
                        result.subscriptions.push({
                            subscriptionId: uuid(),
                            type: Constants.SUBSCRIPTION_TYPE_MESSAGE,
                            hash: this.getHash(event.localId || event.name),
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            correlation: null,
                            condition: null
                        });
                        break;
                    case Constants.TIMER_EVENT:
                        const schedule = this.getTimerSchedule({ ownerId: processData.process.ownerId, timer: event.timer });
                        result.timers.push({
                            timerId: schedule.id,
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            timer: schedule.timer,
                            day: schedule.day,
                            time: schedule.time,
                            partition: schedule.partition,
                        });
                        break;
                    case Constants.ESCALATION_EVENT:
                        break;
                    case Constants.CONDITIONAL_EVENT:
                        break;
                    case Constants.SIGNAL_EVENT:
                        result.subscriptions.push({
                            subscriptionId: uuid(),
                            type: Constants.SUBSCRIPTION_TYPE_SIGNAL,
                            hash: this.getHash(event.localId || event.name),
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            correlation: null,
                            condition: null
                        });
                        break;
                    default:
                        break;
                }
            }
        }
        return result;
    }

    getHash(value) {
        return crypto.createHash("sha256")
            .update(value)
            .digest("hex");
    }

    getTimerSchedule({ ownerId, timer }) {
        const value = timer.expression?.substring(0,1) === "=" ? this.feel.evaluate(timer.expression) : timer.expression;
        let date = null;
        try {
            switch (timer.type) {
                case Constants.TIMER_DATE:
                    date = new Date(value);
                    timer.current = date;
                    break;
                case Constants.TIMER_CYCLE: {
                        const cycle = new Cycle(value);
                        date = cycle.next({ current: timer.current ? new Date(timer.current) : null, cycleCount: timer.cycleCount || 0 });
                        timer.current = date;
                        timer.cycleCount = ( timer.cycleCount || -1 ) + 1;
                    }
                    break;
                case Constants.TIMER_DURATION: {
                        const cycle = new Cycle(value);
                        date = cycle.next({ current: new Date(), cycleCount: timer.cycleCount || 0 });
                    }
                    break;
            }   
            const day = date.toISOString().substring(0,10);
            const time = date.toISOString().substring(11,19);
            // TODO determine partition based on onwerId
            const partition = 0;
            return {
                day,
                time,
                partition,
                id: uuid(),
                timer
            }
        } catch (err) { 
            this.logger.debug("Invalid timer expression",{ timer, error: err.message });
            throw new Error("Invalid timer expression", { timer });
        }
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
