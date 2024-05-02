/**
 * @module cqrs.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 * 
 * Based on https://github.com/nestjs/cqrs
 * MIT license
 * 
 */
 "use strict";

const { v1: uuidv1 } = require("uuid");

class Application {
    constructor({ db, providers }) {
        this.db = db;
        this.commandBus = new CommandBus();
        this.eventBus = new EventBus();
        this.queryBus = new QueryBus();
        this.repositories = {};

        providers.forEach(provider => {
            if (CommandHandler.isPrototypeOf(provider)) {
                const command = provider.forCommand().name;
                const instance = new provider({ application: this });
                this.commandBus.registerHandler(command,instance);
            }
            if (Repository.isPrototypeOf(provider)) {
                const repository = new provider({ application: this, db: this.db, snapshotCounter: provider.setSnapshotCounter() });
                this.repositories[repository.constructor.name] = repository;
            }
            if (EventHandler.isPrototypeOf(provider)) {
                const event = provider.forEvent().name;
                const instance = new provider({ application: this });
                this.eventBus.registerHandler(event,instance);
            }
            if (QueryHandler.isPrototypeOf(provider)) {
                const query = provider.forQuery().name;
                const instance = new provider({ application: this });
                this.queryBus.registerHandler(query,instance);
            }
        });
    }

    getRepository(type) {
        return this.repositories[type.name];
    }

    async getModelById(type, uid) {
        const repository = this.getRepository(type);
        return repository.getById({ uid });
    }

    async execute(command) {
        return await this.commandBus.execute(command);
    }

    async apply(event) {
        return await this.eventBus.apply(event);
    }

    async query(query) {
        return await this.queryBus.execute(query);
    }
}

// Simple memory store
class DefaultDatabase {
    constructor () {
        this.store = {};
        this.uniqueKeys = {};
    }

    async init () {
        return true;
    }

    async connect () {
        return true;
    }

    async disconnect () {
        return true;
    }

    async read({ uid, complete = false }) {
        if (this.store[uid]) {
            if (complete) return {
                uid: this.store[uid].uid,
                version: this.store[uid].version,
                snapshot: null,
                timeuuid: null,
                events: this.store[uid].events
            }
            const lastSnapshotEventIndex = this.store[uid].events.findIndex(event => event.$_timeuuid === this.store[uid].timeuuid);
            const events = this.store[uid].events.filter((event, index) => index > lastSnapshotEventIndex); 
            return {
                uid: this.store[uid].uid,
                version: this.store[uid].version,
                snapshot: this.store[uid].snapshot,
                timeuuid: this.store[uid].timeuuid,
                events
            }
        }
        return {
            uid,
            version: 0,
            snapshot: null,
            timeuuid: null,
            events: []
        }
    }

    async persist({ uid, version, event }) {
        if (!this.store[uid]) {
            this.store[uid] = {
                uid,
                version: 0,
                snapshot: null,
                timeuuid: null,
                events: []
            }
        }
        if (this.store[uid],version !== version) return false;
        const events = Array.isArray(event) ? event : ( event ? [event] : [] );
        for (let i = 0; i < events.length; i++ ) {
            if (!events[i].$_timeuuid) events[i].$_timeuuid = uuidv1();
        }
        if (events) this.store[uid].events.push(...events);
        return true;
    }

    async saveSnapshot({ uid, version, snapshot, timeuuid }) {
        if (this.store[uid]) {
            this.store[uid].version = version;
            this.store[uid].snapshot = snapshot;
            this.store[uid].timeuuid = timeuuid;
            return true;
        }
        return false;
    }

    async preserveUniqueKey({ key, uid }) {
        if (key && uid && !this.uniqueKeys[key]) this.uniqueKeys[key] = uid;
        return this.uniqueKeys[key] || null;
    }

    async getIdByUniqueKey({ key }) {
        return this.uniqueKeys[key] || null;
    }
    
}

class Repository {
    constructor({ db, snapshotCounter, publisher }) {
        this.db = db || new DefaultDatabase();
        this.snapshotCounter = snapshotCounter;
        this.publisher = publisher;
    }
    
    static setSnapshotCounter () {
        return 100;
    }

    forModel() {
        return Model;
    }

    async preserveUniqueKey({ key, uid }) {
        return this.db.preserveUniqueKey({ key, uid });
    }

    async getIdByUniqueKey({ key }) {
        return this.db.getIdByUniqueKey({ key });
    }

    async getById({ uid }) {
        const persistant = await this.db.read({ uid });
        const Model = this.forModel();
        const aggregate = new Model({ repository: this, uid });
        aggregate.setState({ version: persistant.version, state: persistant.snapshot, eventCount: persistant.events.length });
        for (const event of persistant.events) {
            event.$_fromHistory = true;
            aggregate.apply(event);
        }
        return aggregate;
    }

    async persist({ aggregate }) {
        const events = aggregate.getLocalEvents();
        // remember class name (will be otherwise lost during serialization)
        for (const event of events) { event.$_name = event.constructor.name };
        await this.db.persist({ 
            uid: aggregate.uid,
            version: aggregate.getVersion(),
            event: events 
        })
        if (aggregate.getEventCount() > this.snapshotCounter) {
            await this.createSnapshot({ aggregate });
        }
        return true;
    }

    async createSnapshot({ aggregate }) {
        const now = new Date();
        const persistant = await this.db.read({ uid: aggregate.uid });
        const Model = this.forModel();
        const snapshot = new Model({ repository: this, uid: aggregate.uid });
        snapshot.setState({ version: persistant.version, state: persistant.snapshot, eventCount: persistant.events.length });
        let lastAppliedUuid;
        for (const event of persistant.events) {
            event.$_fromHistory = true;
            // must be in the past as new events could be raised after reading from database
            if (this._getDateOfUuid(event.$_timeuuid) >=  now ) { delete event.$_fromHistory; break; }
            snapshot.apply(event);
            lastAppliedUuid = event.$_timeuuid;
        }
        if (lastAppliedUuid) {
            await this.db.saveSnapshot({ 
                uid: snapshot.uid,
                version: snapshot.getVersion() + 1,
                snapshot: snapshot.getState(),
                timeuuid: lastAppliedUuid
            })
        }
    }

    // found in https://stackoverflow.com/questions/17571100/how-to-extract-timestamp-from-uuid-v1-timeuuid-using-javascript
    // part of https://github.com/xehrad/UUID_to_Date
    // Apache License 2.0
    _getDateOfUuid(uuid) {
        const time = this._getTimeOfUuid(uuid) - 122192928000000000;
        const ms = Math.floor(time/10000);
        return new Date(ms);
    }

    _getTimeOfUuid(uuid) {
        const parts = uuid.split("-");
        const time = [
            parts[2].substring(1),
            parts[1],
            parts[0]
        ].join("");
        return parseInt(time,16);
    }

}

class Model {
    constructor ({ repository, uid }) {
        this.repository = repository;
        this.uid = uid;
        this.version = 0;
        this.state = {};
        this.localEvents = [];
    }

    setState ({ version, state, eventCount }) {
        this.version = version || 0;
        this.state = state || {};
        this.eventCount = eventCount;
    }

    getState () {
        return this.state;
    }

    getLocalEvents() {
        return this.localEvents;
    }

    getEventCount() {
        return this.eventCount;
    }

    getVersion() {
        return this.version;
    }

    apply (event) {
        if (!event.$_name) event.$_name = event.constructor.name || "unkown";
        if (!event.$_fromHistory) this.localEvents.push(event);
        delete event.$_fromHistory;
        if (typeof this[`on${event.$_name}`] === "function") this[`on${event.$_name}`](event);
        return event;
    }

    async commit () {
        const events = [...this.localEvents];
        await this.repository.persist({ aggregate: this });
        await this.repository.publisher.emit(events);
        return events;
    }
}

class CommandHandler {
    constructor ({application}) {
        this.application = application;
    }

    static forCommand() {
        return null;
    }
    
    execute(command) {
        return [];
    }
}

class EventHandler {
    constructor ({application}) {
        this.application = application;
    }

    static forEvent() {
        return null;
    }

    apply (event) {
    }
}

class QueryHandler {
    constructor ({application}) {
        this.application = application;
    }

    static forQuery() {
        return null;
    }
    
    execute(query) {
        return null;
    }
}

class CommandBus {
    constructor () {
        this.handler = {}; 
    }

    registerHandler(command,handler) {
        this.handler[command] = handler;
    }

    execute(command) {
        if (!this.handler[command.constructor.name]) throw new MissingCommandhandler({ command: command.constructor.name });
        return this.handler[command.constructor.name].execute(command);
    }
}

class EventBus {
    constructor () {
        this.handler = {}; 
    }

    registerHandler(event,handler) {
        if (!this.handler[event]) this.handler[event] = [];
        this.handler[event].push(handler);
    }

    async apply(event) {
        const events = [];
        if (!this.handler[event.constructor.name]) return null;
        for (const handler of this.handler[event.constructor.name]) {
            const newEvents = await handler.apply(event);
            if (newEvents && newEvents.length > 0) events.push(...newEvents);
        }
        return events;
    }
}

class QueryBus {
    constructor () {
        this.handler = {}; 
    }

    registerHandler(query,handler) {
        this.handler[query] = handler;
    }

    async execute(query) {
        if (!this.handler[query.constructor.name]) throw new MissingQueryhandler({ query: query.constructor.name });
        const result = await this.handler[query.constructor.name].execute(query);
        return result;
    }
}

class Exception extends Error {
    constructor(attributes = {}) {
        super("");
        // Error.captureStackTrace(this, this.constructor);
        Error.captureStackTrace(this);
        this.message = this.constructor.name;
        for (const [attribute, value] of Object.entries(attributes)) this[attribute] = value;
    }
 }

class MissingCommandhandler extends Exception {};
class MissingQueryhandler extends Exception {};

module.exports = {
    Application,
    Repository,
    DefaultDatabase,
    Model,
    CommandHandler,
    EventHandler,
    QueryHandler,
    Exception
};


