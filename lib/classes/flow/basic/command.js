/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

class Command {
    constructor(attributes = {}) {
        for (const [attribute, value] of Object.entries(attributes)) this[attribute] = value;
    }
}

module.exports = {
    Command
};