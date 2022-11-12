/**
 * @module commands/commands.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

/**
 * User commands
 */

 class RequestNewUser {
    constructor({ userId, email, password, locale }) {
        this.userId = userId;
        this.email = email;
        this.password = password;
        this.locale = locale;
    }
}
class RequestConfirmation {
    constructor({ user }) {
        this.user = user;
    }
}
class ConfirmUser {
    constructor({ token }) {
        this.token = token;
    }
}
class SetNewPassword {
    constructor({ user, password }) {
        this.user = user;
        this.password = password;
    }
}
class RequestPasswordReset {
    constructor({ email }) {
        this.email = email;
    }
}
// ResetPassword
// generateTOTP
// activateTOTP
// RequestDeleteUser
// DeleteUser

/**
 * Group commands
 */
class CreateGroup {
    constructor({ user, groupId, label }) {
        this.user = user;
        this.groupId = groupId;
        this.label = label;
    }
}

class RenameGroup {
    constructor({ user, groupId, label }) {
        this.user = user;
        this.groupId = groupId;
        this.label = label;
    }
}

class InviteUser {
    constructor({ user, groupId, mail }) {
        this.user = user;
        this.groupId = groupId;
        this.mail = mail;
    }
}

class JoinGroup {
    constructor({ user, groupId }) {
        this.user = user;
        this.groupId = groupId;
    }
}

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

/**
 * Other commands
 */
// Login

module.exports = {
    RequestNewUser,
    RequestConfirmation,
    ConfirmUser,
    SetNewPassword,
    RequestPasswordReset,

    CreateGroup,
    RenameGroup,
    InviteUser,
    JoinGroup
}
