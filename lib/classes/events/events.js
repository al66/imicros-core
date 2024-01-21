/**
 * @module events/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserEvents = require("./users");
const GroupEvents = require("./groups");
const AgentEvents = require("./agents");

module.exports = {
    ...UserEvents,
    ...GroupEvents,
    ...AgentEvents
}

