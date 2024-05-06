/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Event } = require("./../basic/event");

class TaskStarted extends Event {};

module.exports = TaskStarted;