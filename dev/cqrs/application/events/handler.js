/**
 * @module events/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const UserEventHandler = require("./user/handler");
const GroupEventHandler = require("./group/handler");

module.exports = {
    ...UserEventHandler,
    ...GroupEventHandler
}