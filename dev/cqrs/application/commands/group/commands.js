/**
 * @module commands/group/commands.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

class CreateGroup {
    constructor({ userToken, groupId, label }) {
        this.userToken = userToken;
        this.groupId = groupId;
        this.label = label;
    }
}

class RenameGroup {
    constructor({ userToken, groupId, label }) {
        this.userToken = userToken;
        this.groupId = groupId;
        this.label = label;
    }
}

class InviteUser {
    constructor({ userToken, groupId, email }) {
        this.userToken = userToken;
        this.groupId = groupId;
        this.email = email;
    }
}

class JoinGroup {
    constructor({ invitationToken }) {
        this.invitationToken = invitationToken;
    }
}

// CreateAdminGroup ({ email })
// LeaveGroup
// CancelInvitation
// NominateForAdmin
// AcceptNomination
// RequestRevokeAdmin
// AcceptRevoke
// RevokeAdmin
// RemoveMember
// RequestDeleteGroup
// DeleteGroup
// CreateAgent
// RenameAgent
// DeleteAgent
// GenerateAgentAuthToken
// RemoveAgentAuthToken
// GrantAccessForService
// LogInAgent


module.exports = {
    CreateGroup,
    RenameGroup,
    InviteUser,
    JoinGroup
}
