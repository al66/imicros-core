/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler, EventHandler, QueryHandler } = require("./handler");
const { CommandBus, EventBus, QueryBus } = require("./busses");
const { Model } = require("./model");

class Application {
    constructor({ db, logger, providers }) {
        this.db = db;
        this.logger = logger;
        this.commandBus = new CommandBus();
        this.eventBus = new EventBus();
        this.queryBus = new QueryBus();
        this.queued = 0;
        this.repository = {};
        this.replay = false;
        this.uid = null;
        this.version = 0;

        providers.forEach(provider => {
            if (CommandHandler.isPrototypeOf(provider)) {
                const command = provider.forCommand().name;
                const instance = new provider({ application: this });
                this.commandBus.registerHandler(command,instance);
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

    async getLocalEvents() {
        await this.waitIdle();
        // await new Promise(resolve => setTimeout(resolve,200));
        const events = [...Object.keys(this.repository).map(modelId => this.repository[modelId].getLocalEvents())].flat();
        events.sort((a,b) => a.$_timeuuid - b.$_timeuuid);
        return events;
    }

    async getLocalData() {
        await this.waitIdle();
        const data = {};
        Object.keys(this.repository).map(modelId => {
            data[modelId] = {
                state: this.repository[modelId].getState(),
                context: this.repository[modelId].getContext()
            }
        })
        return data;
    }

    getVersion() {
        return this.version;
    }

    getModelById(uid) {
        return this.repository[uid];
    }

    addModel({ uid, machine, meta, snapshot = null }) {
        if (this.repository[uid]) return this.repository[uid];
        const model = new Model({ uid, machine, application: this, meta, snapshot });
        this.repository[uid] = model;
        return model;
    }

    waitIdle() {
        return new Promise((resolve,reject) => {
            const check = () => {
                if (this.queued <= 0) resolve();
                else setTimeout(check,10);
            };
            check();
        });
    }   

    async emit(event) {
        if (this.replay) return;
        this.queued++;
        await this.eventBus.apply(event);
        this.queued--;
    }

    async execute(command) {
        if (this.replay) return;
        this.queued++;
        await this.commandBus.execute(command);
        this.queued--;
    }

    async apply(event) {
        event.$_fromHistory = true;
        this.queued++;
        await this.eventBus.apply(event);
        this.queued--;
    }

    async query(query) {
        return await this.queryBus.execute(query);
    }

    async load({ owner, accessToken, uid }) {
        const persistant = await this.db.getApp({ owner, accessToken, uid });
        //console.log("load",persistant);
        await this.restore({ version: persistant.version, snapshot: persistant.snapshot, events: persistant.events, timeuuid: persistant.timeuuid });
        this.uid = uid;
        this.logger.debug("Application loaded and restored",{ uid: this.uid });
    }

    async persist ({ owner, accessToken }) {
        const events = await this.getLocalEvents();
        await this.persistApp({ owner, accessToken, events });
        // await this.createSnapshot({ owner, accessToken, uid: this.uid });
        // update last snapshot with current state
        const snapshot = this.snapshot || {};
        Object.keys(this.repository).map(modelId => {
            snapshot[modelId] = {
                state: this.repository[modelId].getState(),
                context: this.repository[modelId].getContext(),
                machine: this.repository[modelId].getMachineName(),
                meta: this.repository[modelId].getMeta(),
                type: this.repository[modelId].getType()
            }
        })
        const timeuuid = events.length > 0 ? events.sort((a,b) => a.$_timeuuid - b.$_timeuuid)[events.length-1].$_timeuuid : this.timeuuid;
        await this.db.saveAppSnapshot({ 
            owner,
            accessToken,
            uid: this.uid,
            version: this.version + 1,
            snapshot,
            timeuuid
        })
        return true;
    }

    async persistApp({ owner, accessToken, events }) {
        await this.db.persistApp({ 
            owner,
            accessToken,
            uid: this.uid,
            version: this.version,
            event: events 
        })
    }

    async createSnapshot({ owner, accessToken, uid }) {
        await this.load({ owner, accessToken, uid });
        const events = await this.getLocalEvents();
        const snapshot = this.snapshot || {};
        // update last snapshot with current state
        Object.keys(this.repository).map(modelId => {
            snapshot[modelId] = {
                state: this.repository[modelId].getState(),
                context: this.repository[modelId].getContext(),
                machine: this.repository[modelId].getMachineName(),
                meta: this.repository[modelId].getMeta(),
                type: this.repository[modelId].getType()
            }
        })
        const timeuuid = events.length > 0 ? events.sort((a,b) => a.$_timeuuid - b.$_timeuuid)[events.length-1].$_timeuuid : this.timeuuid;
        await this.db.saveAppSnapshot({ 
            owner,
            accessToken,
            uid: this.uid,
            version: this.version + 1,
            snapshot,
            timeuuid
        })
        return true;
    }

    /* new faster method for non-parallel instance processing */ 
    async persistAppWithSnapshot({ owner, accessToken }) {
        const events = await this.getLocalEvents();
        const snapshot = this.snapshot || {};
        Object.keys(this.repository).map(modelId => {
            snapshot[modelId] = {
                state: this.repository[modelId].getState(),
                context: this.repository[modelId].getContext(),
                machine: this.repository[modelId].getMachineName(),
                meta: this.repository[modelId].getMeta(),
                type: this.repository[modelId].getType()
            }
        })
        const timeuuid = events.length > 0 ? events.sort((a,b) => a.$_timeuuid - b.$_timeuuid)[events.length-1].$_timeuuid : this.timeuuid;
        await this.db.persistAppWithSnapshot({ 
            owner,
            accessToken,
            uid: this.uid,
            version: this.version,
            event: events,
            snapshot,
            timeuuid
        });

    }

    getMachineByName(name) { }

    async restore({ version, snapshot, events, timeuuid }) {
        this.repository = {};
        this.snapshot = snapshot || {};
        this.version = version;
        this.timeuuid = timeuuid;
        this.replay = true;
        // restore repository objects
        for (let modelId of Object.keys(this.snapshot)) {
            const machine = this.getMachineByName(snapshot[modelId].machine);
            if (!machine) throw new Error("Machine not found");
            this.addModel({ uid: modelId, machine, meta: snapshot[modelId].meta, snapshot: snapshot[modelId] });
        }
        // replay events
        for (let event of events) {
            const machine = this.getMachineByName(event.$_machine);
            if (!machine) throw new Error("Machine not found");
            const model = this.addModel({ uid: event.$_modelId, machine, meta: event.$_meta, snapshot: this.snapshot[event.$_modelId] || {} });
            await model.apply(event);
        }
        this.replay = false;
    }

}

module.exports = {
    Application
};
