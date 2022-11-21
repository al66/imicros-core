/**
 * @module events/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserEvents = require("./user/events");
const GroupEvents = require("./group/events");

module.exports = {
    ...UserEvents,
    ...GroupEvents
}

