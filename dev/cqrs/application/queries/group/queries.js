/**
 * @module queries/group/queries.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

/** 
 * Queries
 */
class GetGroup {
    constructor({ userToken, groupId}) {
        this.userToken = userToken;
        this.groupId = groupId;
    }
}
 
 // GetGroupsUserIsMember
 // GetInvitationsForUser
 // GetGroup
 // GetGroupMembers
 // GetAgent
 // GetAgents
 // GetAgentAuthToken
 // RequestGroupAccess
 // VerifyToken
 // ResolveToken
 
 
 
module.exports = {
    GetGroup
}
 