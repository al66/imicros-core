/**
 * @module queries/queries.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserQueries = require("./user/queries");
const SessionQueries = require("./session/queries");
const GroupQueries = require("./group/queries");

module.exports = {
    ...UserQueries,
    ...SessionQueries,
    ...GroupQueries
}
