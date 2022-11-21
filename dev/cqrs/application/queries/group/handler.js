/**
 * @module queries/group/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { QueryHandler } = require("../../../cqrs/cqrs");
const { GroupRepository } = require("../../repositories/group");
const {
    GetGroup
} = require("./queries");
const { 
    OnlyAllowedForMembers
} = require("../../exceptions/exceptions");

/**
 * Query Handler
 */
class GetGroupHandler extends QueryHandler {
    static forQuery () { return GetGroup }
    async execute(query) {
        const decoded = this.application.verifyJWT(query.userToken);
        const group = await this.application.getModelById(GroupRepository, query.groupId);
        // validate query
        if (!group.isMember({ user: decoded.user })) throw new OnlyAllowedForMembers({ query: query.constructor.name });
        return group.state;
    } 
}

module.exports = {
    GetGroupHandler
}
