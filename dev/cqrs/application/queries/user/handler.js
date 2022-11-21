/**
 * @module queries/user/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { QueryHandler } = require("../../../cqrs/cqrs");
const { UserRepository } = require("../../repositories/user");
const {
    GetUser
} = require("./queries");

/**
 * Query Handler
 */
class GetUserHandler extends QueryHandler {
    static forQuery () { return GetUser }
    async execute(query) {
        const decoded = this.application.verifyJWT(query.authToken);
        const user = await this.application.getModelById(UserRepository, decoded.userId);
        return user.state;
    } 
}

module.exports = {
    GetUserHandler
}