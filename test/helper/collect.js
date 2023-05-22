"use strict";

const events = {};

function initEvents () {
    for (const [key,value] of Object.entries(events)) {
        delete events[key];
    }
}

const Collect = {
    name: "helper.collect",
    events: {
        "**": {
            group: "users", // could also be "groups", "agents", "admin"
            handler (ctx) {
                const sender = ctx.nodeID;
                const payload = ctx.params;
                const event = ctx.eventName;
                this.events[ctx.eventName] ? this.events[ctx.eventName].push({payload: ctx.params, sender, event, ctx}) : this.events[event] = [{payload, sender, event, ctx}];
            }
        }
    },
    created () {
        this.events = events;
    }
};

module.exports = {
    Collect,
    events,
    initEvents
};