/**
 * @module group.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";


const { Application } = require("../cqrs/cqrs");
const { Repositories } = require("./repositories/repositories");
const { CommandHandlers } = require("./commands/handler");
const { EventHandlers } = require("./events/handler");
const { QueryHandlers } = require("./queries/handler");

 /**
  * Application
  */
class AuthApplication extends Application {
    constructor ({ db }) {
        super({
            db,
            providers: [
                ...Repositories, 
                ...CommandHandlers,
                ...EventHandlers,
                ...QueryHandlers
            ]
        })
    }
}

module.exports = {
    AuthApplication
} 
