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
        "**"(payload, sender, event, ctx) {
            this.events[event] ? this.events[event].push({payload, sender, event, ctx}) : this.events[event] = [{payload, sender, event, ctx}];
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