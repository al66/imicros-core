/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Event } = require("./../basic/event");

class JobFailed extends Event {};

module.exports = JobFailed;