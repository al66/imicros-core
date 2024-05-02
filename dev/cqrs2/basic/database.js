"use strict";

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

    async getApp({ owner, accessToken, uid, fromBeginning = false }) {
        if(!owner || !accessToken) throw new Error("Owner or AccessToken missing");
        if (this.store[uid]) {
            if (fromBeginning) return {
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

    async persistApp({ owner, accessToken, uid, version, event }) {
        if(!owner || !accessToken) throw new Error("Owner or AccessToken missing");
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

    async saveAppSnapshot({ owner, accessToken, uid, version, snapshot, timeuuid }) {
        if(!owner || !accessToken) throw new Error("Owner or AccessToken missing");
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

module.exports = {
    DefaultDatabase
} 