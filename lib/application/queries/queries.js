/**
 * @module queries/queries.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

/** 
 * Queries
 */
class GetGroup {
    constructor({ user, groupId}) {
        this.user = user;
        this.groupId = groupId;
    }
}

// GetUser
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
    GetGroup,
    Queries: [
        GetGroup
    ]
}
