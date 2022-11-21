/**
 * @module group.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";


const { Application } = require("../cqrs");
const Repositories = require("./repositories/repositories");
const CommandHandlers = require("./commands/handler");
const EventHandlers = require("./events/handler");
const QueryHandlers = require("./queries/handler");

const { UnvalidToken } = require("./exceptions/exceptions");

const jwt 		= require("jsonwebtoken");

 /**
  * Application
  */
class AuthApplication extends Application {
    constructor ({ db, jwtSecret }) {
        super({
            db,
            providers: [
                ...Object.keys(Repositories).map(key => Repositories[key]),
                ...Object.keys(CommandHandlers).map(key => CommandHandlers[key]),
                ...Object.keys(EventHandlers).map(key => EventHandlers[key]),
                ...Object.keys(QueryHandlers).map(key => QueryHandlers[key])
            ]
        })
        this.jwtSecret = jwtSecret;
    }

    signedJWT(payload) {
        let today = new Date();
        let exp = new Date(today);
        exp.setDate(today.getDate() + 60);
        payload.exp = Math.floor(exp.getTime() / 1000);
        return jwt.sign(payload, this.jwtSecret);
    }
    
    verifyJWT(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (err) {
            throw new UnvalidToken({ token });
        }
    }

    generateTOTPSecret () {
        
    } 
}

module.exports = {
    AuthApplication
} 
