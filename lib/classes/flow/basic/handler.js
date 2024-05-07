/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

class CommandHandler {
    constructor ({application}) {
        this.application = application;
    }

    /* istanbul ignore next */
    static forCommand() {
        return null;
    }
    
    /* istanbul ignore next */
    async execute(command) {
        return [];
    }
}

class EventHandler {
    constructor ({application}) {
        this.application = application;
    }

    /* istanbul ignore next */
    static forEvent() {
        return null;
    }

    /* istanbul ignore next */
    async apply (event) {
    }
}

class QueryHandler {
    constructor ({application}) {
        this.application = application;
    }

    /* istanbul ignore next */
    static forQuery() {
        return null;
    }
    
    /* istanbul ignore next */
    async execute(query) {
        return null;
    }
}

module.exports = {
    CommandHandler,
    EventHandler,
    QueryHandler
}
