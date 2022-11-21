/**
 * @module queries/session/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { QueryHandler } = require("../../../cqrs/cqrs");
const { UserRepository } = require("../../repositories/user");
const {
    verifyAuthToken
} = require("./queries");


/**
 * Query Handler
 */
 class verifyAuthTokenHandler extends QueryHandler {
    static forQuery () { return verifyAuthToken }
    async execute(query) {
        const decoded = this.application.verifyJWT(query.authToken);
        if (decoded.userId) {
            const user = await this.application.getModelById(UserRepository, decoded.userId);
            return this.application.signedJWT({ 
                type: "userToken", 
                userId: user.state.uid, 
                sessionId: decoded.sessionId,
                user: user.getTokenData()
            });
        }
        return false;
    } 
}


module.exports = {
    verifyAuthTokenHandler
}
