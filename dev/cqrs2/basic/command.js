"use strict";

class Command {
    constructor(attributes = {}) {
        for (const [attribute, value] of Object.entries(attributes)) this[attribute] = value;
    }
}

module.exports = {
    Command
};