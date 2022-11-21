/**
 * @module commands/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserCommandHandlers = require("./user/handler");
const SessionCommandHandlers = require("./session/handler");
const GroupCommandHandlers = require("./group/handler");

module.exports = {
    ...UserCommandHandlers,
    ...SessionCommandHandlers,
    ...GroupCommandHandlers
}
