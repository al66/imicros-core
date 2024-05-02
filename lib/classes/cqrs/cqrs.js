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
const clone = require("rfdc")();    // Really Fast Deep Clone

const { 
    AggregateHasBeenDeleted
} = require("../exceptions/exceptions");

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
            events[i].$_timeuuid = uuidv1();
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

    async delete({ uid }) {
        if (this.store[uid]) delete this.store[uid];
        return true;
    }

    async deleteUniqueKey({ key }) {
        if (this.uniqueKeys[key]) delete this.uniqueKeys[key];
        return true;
    }

    async preserveUniqueKey({ key, uid }) {
        if (key && uid && !this.uniqueKeys[key]) this.uniqueKeys[key] = uid;
        return this.uniqueKeys[key] || null;
    }

    async getIdByUniqueKey({ key }) {
        return this.uniqueKeys[key] || null;
    }

    async getLog({ uid, from, to }) {
        let events = [];
        if (this.store[uid].events) {
            events = this.store[uid].events.filter((event, index) => {
                const time = this._getDateOfUuid(event.$_timeuuid);
                if (from && time < from) return false;
                if (to && time > to) return false;
                return true;
            });
        }
        const result = {
            events: clone(events),
            count: events.length,
            limit: 0,   // no limit
        }
        return result;
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
        if (aggregate.isDeleted()) throw new AggregateHasBeenDeleted({ uid, model: this.forModel().constructor.name });
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

    async delete({ uid }) {
        return this.db.delete({ uid });
    }

    async deleteUniqueKey({ uid }) {
        return this.db.deleteUniqueKey({ uid });
    }

    async getLog({ uid, from, to }) {
        return this.db.getLog({ uid, from, to });
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

    isDeleted () {
        return this.deleted ? true : false;
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

    async commit ({ emit = true } = {}) {
        const events = [...this.localEvents];
        await this.repository.persist({ aggregate: this });
        if (emit) await this.repository.publisher.emit(events);
        return events;
    }
}

module.exports = {
    Repository,
    DefaultDatabase,
    Model
}


