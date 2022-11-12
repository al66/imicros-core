/**
 * @module events/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 class MemoryDatabase {
    constructor () {
        this.store = {};
        this.userMailIndex = {};
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

    async updateUserMailIndex({ email, uid }) {
        console.log(email, this.userMailIndex);
        if (this.userMailIndex[email] && this.userMailIndex[email] !== uid) return false;
        this.userMailIndex[email] = uid;
        return true;
    }
 }

 module.exports = {
    MemoryDatabase
 }