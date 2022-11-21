/**
 * @module events/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { DefaultDatabase } = require("../../cqrs/cqrs");

 class MemoryDatabase extends DefaultDatabase{
/*
    constructor () {
        this.store = {};
        this.uniqueKeys = {};
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

    async preserveUniqueKey({ key, uid }) {
        if (key && uid && !this.uniqueKeys[key]) this.uniqueKeys[key] = uid;
        return this.uniqueKeys[key] || null;
    }
*/
 }

 module.exports = {
    MemoryDatabase
 }