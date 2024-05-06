/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { MissingCommandhandler, MissingQueryhandler } = require("./exceptions");

class Bus {
    constructor () {
        this.handler = {}; 
    }
}

class CommandBus extends Bus {
    
    registerHandler(command,handler) {
        this.handler[command] = handler;
    }

    async execute(command) {
        if (!this.handler[command.constructor.name]) throw new MissingCommandhandler({ command: command.constructor.name });
        try {
            await this.handler[command.constructor.name].execute(command);
        } catch (err) {
            // TODO
        } finally {
        }
        return true;
    }
}

class EventBus  extends Bus {

    registerHandler(event,handler) {
        if (!this.handler[event]) this.handler[event] = [];
        this.handler[event].push(handler);
    }

    async apply(event) {
        if (!this.handler[event.constructor.name]) return null;
        try {
            for (const handler of this.handler[event.constructor.name]) {
                await handler.apply(event);
            }
        } catch (err) {
            // TODO
        } finally {
        }
        return true;
    }
}

class QueryBus  extends Bus {

    registerHandler(query,handler) {
        this.handler[query] = handler;
    }

    async execute(query) {
        if (!this.handler[query.constructor.name]) throw new MissingQueryhandler({ query: query.constructor.name });
        this.setBusy();
        let result = null;
        try {
            result = await this.handler[query.constructor.name].execute(query);
        } catch (err) {
            // TODO
        } finally {
        }
        return result;
    }
}

module.exports = {
    CommandBus,
    EventBus,
    QueryBus
}
