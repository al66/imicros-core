/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../util/constants");
const { Activity } = require("./activity");
const { Event } = require("./event");
const { Gateway } = require("./gateway");
const { Sequence } = require("./sequence");

const { v4: uuid } = require("uuid");
const _ = require("../../modules/util/lodash");

/**
 * Class Process
 * 
 * Instantiated with the parsed process data
 * 
 * holds the process data and provides access to the elements
 */
class Process {
    constructor({ logger, store, ownerId, accessToken, processId, versionId, parsedData, instanceId = null, tokenData = {} }) {
        // Moleculer logger
        this.logger = logger;

        // Store provider
        this.store = store;

        // owner
        this.ownerId = ownerId;
        this.accessToken = accessToken;

        // process data
        this.processId = processId;
        this.versionId = versionId;
        this.parsedData = parsedData;

        // instance
        this.instanceId = instanceId || uuid();

        // instance token
        this.tokenData = {
            persistent: {
                active: tokenData.active || [],
                history: tokenData.history || [],
            },
            local: {
                active: tokenData.active || [],
                history: tokenData.history || [],
            },
            persist: {
                consume: [],
                emit: []
            }
        };

        // instance context
        this.context = {
            local: {},
            persist: {}
        };

        this.status = {
            completed: false
        }
    }

    getInstance() {
        return this.instanceId;
    }

    async processToken({ token }) {
        // TODO
        const element = this.getElement({ elementId: token.elementId });
        await element.processToken({ token });
    }

    getElement({ elementId }) {
        // search in sequences
        let element = this.parsedData.sequence.find(sequence => sequence.id === elementId);
        if (element) return new Sequence({ process: this, element});
        // search in tasks
        element = this.parsedData.task.find(task => task.id === elementId);
        if (element) return new Activity({ process: this, element})
        // search in events
        element = this.parsedData.event.find(event => event.id === elementId);
        if (element) return new Event({ process: this, element})
        // search in gateways
        element = this.parsedData.gateway.find(gateway => gateway.id === elementId);
        if (element) return new Gateway({ process: this, element})

        this.logger.error("Element not found", { processId: this.processId, versionId: this.versionId, elementId });
        throw new Error("Element not found");
    }

    getNext({ elementId }) {
        let next = [];
        // search in sequences
        let element = this.parsedData.sequence.find(sequence => sequence.id === elementId);
        // search in tasks
        if (!element) element = this.parsedData.task.find(task => task.id === elementId);
        // search in events
        if (!element) element = this.parsedData.event.find(event => event.id === elementId);
        // search in gateways
        if (!element) element = this.parsedData.gateway.find(event => event.id === elementId);
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
            let element = this.parsedData.sequence.find(sequence => sequence.id === id);
            if (element) return new Sequence({ process: this, element});
            // search in tasks
            element = this.parsedData.task.find(task => task.id === id);
            if (element) return new Activity({ process: this, element})
            // search in events
            element = this.parsedData.event.find(event => event.id === id);
            if (element) return new Event({ process: this, element})
            // search in gateways
            element = this.parsedData.gateway.find(event => event.id === id);
            if (element) return new Gateway({ process: this, element})
            // TODO: sub process, call activity, transaction
            return null;
        });

        return next;
    }

    activateNext({ token }) {
        // TODO
    }

    logToken({ consume = [], emit = [] }) {
        this.tokenData.persist.consume.push(...consume);
        this.tokenData.persist.emit.push(...emit);
        this.tokenData.local.active.push(...emit);
        this.tokenData.local.active = this.tokenData.local.active.filter(token => !consume.some(t => token.elementId === t.elementId && token.status === t.status));
    }

    getActiveToken() {
        return this.tokenData?.local?.active || [];
    }

    setNewTokenStatus({ token, status }) {
        let newToken = _.cloneDeep(token);
        newToken.status = status;
        return newToken;
    }

    addToContext({ key, value }) {
        this.context.local[key] = value;
        this.context.persist[key] = value;
        return true;
    }

    async getContextKeys({ keys = null, input = null }) {
        // TODO
    }

    async getContextKey({ key }) {
        if (this.context.local[key]) return this.context.local[key];
        // TODO
        // this.context.local[key] = await this.db.getContextKey({ opts: this.opts, instanceId: this.instanceId, key });
        this.context.local[key] = null;
        return this.context.local[key];
    }

    taskCompleted({ token, result = null, error = null}) {
        // TODO
        // this.status.completed = true;
        return true
    }

    persist() {
        // TODO
        // anything to do ?
        if (Object.keys(this.context.persist).length > 0) {
            // persist context
        }
        if (this.tokenData.persist.consume.length > 0 || this.tokenData.persist.emit.length > 0) {
            // persist token
        }
        if (this.status.completed) {
            // persist instance
        }
        return true;
    }
    

}

module.exports = {
    Process
};

