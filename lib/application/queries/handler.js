/**
 * @module queries/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { QueryHandler } = require("../../cqrs/cqrs");
const { GroupRepository } = require("../repositories/group");
const {
    GetGroup
} = require("./queries");
const { 
    OnlyAllowedForMembers
} = require("../exceptions/exceptions");

/**
 * QueryHandler
 */
class GetGroupHandler extends QueryHandler {
    static forQuery () { return GetGroup }
    async execute(query) {
        const group = await this.application.getModelById(GroupRepository, query.groupId);
        // validate query
        if (!group.isMember({ user: query.user })) throw new OnlyAllowedForMembers({ query: query.constructor.name });
        return group.state;
    } 
}

module.exports = {
    GetGroupHandler,
    QueryHandlers: [
        GetGroupHandler
    ]
}
