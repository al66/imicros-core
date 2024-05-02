"use strict";

const { v1: uuidv1 } = require("uuid");


class Model {
    constructor ({ application, uid = null, machine, meta = {}, snapshot = null }) {
        this.application = application;
        this.uid = uid;
        this.state = snapshot?.state || machine?.initialState || "unknown";
        this.machine = machine;
        this.meta = meta;
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

    getMeta() {
        return this.meta;
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
        if (this.type) {
            if (typeof this.machine.states[this.type][this.state][`on${command.$_name}`] === "function") {
                await this.machine.states[this.type][this.state][`on${command.$_name}`]({ command, self: this });
            }
        } else {
            if (typeof this.machine.states[this.state][`on${command.$_name}`] === "function") {
                await this.machine.states[this.state][`on${command.$_name}`]({ command, self: this });
            }
        }
        return command;
    }

    async apply (event) {
        if (!event.$_name) event.$_name = event.constructor.name || "unkown";
        try {
            if (this.type) {
                if (typeof this.machine.states[this.type][this.state][`on${event.$_name}`] === "function") {
                    await this.machine.states[this.type][this.state][`on${event.$_name}`]({ event, self: this });
                    if (!event.$_timeuuid) event.$_timeuuid = uuidv1();
                    if (!event.$_timestamp) event.$_timestamp = new Date().getTime();
                    if (!event.$_machine) event.$_machine = this.machine.name;
                    if (!event.$_modelId) event.$_modelId = this.uid;
                    if (!event.$_meta) event.$_meta = this.meta;
                    if (!event.$_fromHistory) this.localEvents.push(event);
                    //delete event.$_fromHistory;
                }
            } else {
                if (typeof this.machine.states[this.state][`on${event.$_name}`] === "function") {
                    await this.machine.states[this.state][`on${event.$_name}`]({ event, self: this });
                    if (!event.$_timeuuid) event.$_timeuuid = uuidv1();
                    if (!event.$_timestamp) event.$_timestamp = new Date().getTime();
                    if (!event.$_machine) event.$_machine = this.machine.name;
                    if (!event.$_modelId) event.$_modelId = this.uid;
                    if (!event.$_meta) event.$_meta = this.meta;
                    if (!event.$_fromHistory) this.localEvents.push(event);
                    // delete event.$_fromHistory;
                }
            }
        } catch (err) {
            console.log(`No handler for event ${event.$_name} in model type ${this.type} in state ${this.state}`, this.machine.states, err);
        }
        return event;
    }

}

module.exports = { Model };