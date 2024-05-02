"use strict";

class CommandHandler {
    constructor ({application}) {
        this.application = application;
    }

    static forCommand() {
        return null;
    }
    
    async execute(command) {
        return [];
    }
}

class EventHandler {
    constructor ({application}) {
        this.application = application;
    }

    static forEvent() {
        return null;
    }

    async apply (event) {
    }
}

class QueryHandler {
    constructor ({application}) {
        this.application = application;
    }

    static forQuery() {
        return null;
    }
    
    async execute(query) {
        return null;
    }
}

module.exports = {
    CommandHandler,
    EventHandler,
    QueryHandler
}
