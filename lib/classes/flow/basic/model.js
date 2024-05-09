/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { v1: uuidv1 } = require("uuid");

class Model {
    constructor ({ application, uid = null, machine, meta = {}, snapshot = null }) {
        this.application = application;
        this.logger = application.logger;
        this.uid = uid;
        this.state = snapshot?.state || machine?.initialState || "unknown";
        this.machine = machine;
        this.meta = meta;
        this.type = snapshot?.type || null;
        this.context = snapshot?.context || {};
        this.localEvents = [];        
        if (typeof this.machine.init === "function") this.machine.init({ context: this.context, self: this, meta });
    }

    getState () {
        return this.state;
    }

    getLocalEvents() {
        return this.localEvents;
    }

    getContext() {
        return this.context;
    }

    getContextData() {
        return this.context?.data || {};
    }

    getMeta() {
        return this.meta;
    }

    getType() {
        return this.type;
    }

    getMachineName() {
        return this.machine.name;
    }

    async emit (event) {
        await this.application.emit(event);
    }

    async execute (command) {
        await this.application.execute(command);
    }

    async dispatch (command) {
        if (!command.$_name) command.$_name = command.constructor.name || "unkown";
        let dispatched = false;
        try {
            if (this.type && this.machine.states[this.type] && this.machine.states[this.type][this.state]) {
                if (typeof this.machine.states[this.type][this.state][`on${command.$_name}`] === "function") {
                    await this.machine.states[this.type][this.state][`on${command.$_name}`]({ command, self: this });
                    dispatched = true;
                }
            } 
            // second try without state
            if (this.type && this.machine.states[this.type] && !dispatched) {
                if (typeof this.machine.states[this.type][`on${command.$_name}`] === "function") {
                    await this.machine.states[this.type][`on${command.$_name}`]({ command, self: this });
                    dispatched = true;
                }
            }
            // third try without type
            if (!dispatched && this.machine.states[this.state]) {
                if (typeof this.machine.states[this.state][`on${command.$_name}`] === "function") {
                    await this.machine.states[this.state][`on${command.$_name}`]({ command, self: this });
                    dispatched = true;
                }
            }
            // last try state independent
            if (!dispatched) {
                if (typeof this.machine.states[`on${command.$_name}`] === "function") {
                    await this.machine.states[`on${command.$_name}`]({ command, self: this });
                }
            }
        } catch (err) {
            this.logger.debug(`No handler for command`,{
                command: command,
                machine: this.machine.name,
                type: this.type,
                state: this.state,
                states: this.machine.states,
                err: err
            });
        }
        return command;
    }

    async apply (event) {
        if (!event.$_name) event.$_name = event.constructor.name || "unkown";
        let applied = false;
        try {
            if (this.type && this.machine.states[this.type] && this.machine.states[this.type][this.state]) {
                if (typeof this.machine.states[this.type][this.state][`on${event.$_name}`] === "function") {
                    await this.machine.states[this.type][this.state][`on${event.$_name}`]({ event, self: this });
                    if (!event.$_timeuuid) event.$_timeuuid = uuidv1();
                    if (!event.$_timestamp) event.$_timestamp = new Date().getTime();
                    if (!event.$_machine) event.$_machine = this.machine.name;
                    if (!event.$_modelId) event.$_modelId = this.uid;
                    if (!event.$_meta) event.$_meta = this.meta;
                    if (!event.$_fromHistory) this.localEvents.push(event);
                    applied = true;
                }
            } 
            // second try without type
            if (!applied && this.machine.states[this.state]) {
                if (typeof this.machine.states[this.state][`on${event.$_name}`] === "function") {
                    await this.machine.states[this.state][`on${event.$_name}`]({ event, self: this });
                    if (!event.$_timeuuid) event.$_timeuuid = uuidv1();
                    if (!event.$_timestamp) event.$_timestamp = new Date().getTime();
                    if (!event.$_machine) event.$_machine = this.machine.name;
                    if (!event.$_modelId) event.$_modelId = this.uid;
                    if (!event.$_meta) event.$_meta = this.meta;
                    if (!event.$_fromHistory) this.localEvents.push(event);
                    applied = true;
                }
            }
            // last try state independent
            if (!applied) {
                if (typeof this.machine.states[`on${event.$_name}`] === "function") {
                    await this.machine.states[`on${event.$_name}`]({ event, self: this });
                    if (!event.$_timeuuid) event.$_timeuuid = uuidv1();
                    if (!event.$_timestamp) event.$_timestamp = new Date().getTime();
                    if (!event.$_machine) event.$_machine = this.machine.name;
                    if (!event.$_modelId) event.$_modelId = this.uid;
                    if (!event.$_meta) event.$_meta = this.meta;
                    if (!event.$_fromHistory) this.localEvents.push(event);
                }
            }
        } catch (err) {
            this.logger.debug(`No handler for event`,{
                event: event,
                machine: this.machine.name,
                type: this.type,
                state: this.state,
                states: this.machine.states,
                err: err
            });
        }
        return event;
    }

}

module.exports = { Model };