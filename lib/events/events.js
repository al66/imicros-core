/**
 * @module events/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserEvents = require("./users");
const GroupEvents = require("./groups");

module.exports = {
    ...UserEvents,
    ...GroupEvents
}

