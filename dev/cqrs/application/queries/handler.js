/**
 * @module queries/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserQueryHandler = require("./user/handler");
const SessionQueryHandler = require("./session/handler");
const GroupQueryHandler = require("./group/handler");

module.exports = {
    ...UserQueryHandler,
    ...SessionQueryHandler,
    ...GroupQueryHandler
}
