/**
 * @module cqrs.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

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
                const repository = new provider({ application: this, db: this.db });
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
    }

    async read({ uid }) {
        if (this.store[uid]) return this.store[uid];
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
        if (events) this.store[uid].events.push(...events);
    }
}

class Repository {
    constructor({ application, db }) {
        this.application = application;
        this.db = db || new DefaultDatabase();
    }
    
    forModel() {
        return Model;
    }

    async getById({ uid }) {
        const persistant = await this.db.read({ uid });
        const Model = this.forModel();
        const aggregate = new Model({ repository: this, uid });
        aggregate.setState({ version: persistant.version, state: persistant.state });
        for (const event of persistant.events) {
            event.$_fromHistory = true;
            aggregate.apply(event);
        }
        return aggregate;
    }

    async persist({ aggregate }) {
        const events = aggregate.getLocalEvents();
        await this.db.persist({ 
            uid: aggregate.uid,
            version: aggregate.getVersion(),
            event: events 
        })
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

    setState ({ version, state }) {
        this.version = version || 0;
        this.state = state || {};
    }

    getState () {
        return this.state;
    }

    getLocalEvents() {
        return this.localEvents;
    }

    getVersion() {
        return this.version;
    }

    apply (event) {
        if (!event.$_fromHistory) this.localEvents.push(event);
        if (typeof this[`on${event.constructor.name}`] === "function") this[`on${event.constructor.name}`](event);
        return event;
    }

    async commit () {
        const events = [...this.localEvents];
        await this.repository.persist({ aggregate: this });
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
        if (!this.handler[command.constructor.name]) throw new Error("Missing handler for command", { command: command.constructor.name });
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

    apply(event) {
        if (!this.handler[event.constructor.name]) return 0;
        for (const handler of this.handler[event.constructor.name]) {
            handler.apply(event);
        }
        return this.handler[event.constructor.name].length;
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
        if (!this.handler[query.constructor.name]) throw new Error("Missing handler for query", { query: query.constructor.name });
        const result = await this.handler[query.constructor.name].execute(query);
        return result;
    }
}

class Exception extends Error {
    constructor(attributes = {}) {
        super("");
        Error.captureStackTrace(this, this.constructor);
        this.message = this.constructor.name;
        for (const [attribute, value] of Object.entries(attributes)) this[attribute] = value;
    }
}

module.exports = {
    Application,
    Repository,
    Model,
    CommandHandler,
    EventHandler,
    QueryHandler,
    Exception
};


