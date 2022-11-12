/**
 * @module events/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

/** 
 * User Events
 */

class UserCreated {
    constructor({ userId, email, passwordHash, locale }) {
        this.userId = userId;
        this.email = email;
        this.passwordHash = passwordHash;
        this.locale = locale;
        this.createdAt = new Date().getTime();
    }
}
// UserConfirmationRequested
// UserConfirmed
// PasswordResetRequested
// NewPasswordSet
// PasswordReset
// TOTPGenerated
// TOTPActivated
// UserDeletionRequested
// UserDeleted

/**
 * Group events
 */

class GroupCreated {
    constructor({ groupId, label }) {
        this.createdAt = new Date().getTime();
        this.groupId = groupId;
        this.label = label;
    }
}

class GroupRenamed {
    constructor({ user, groupId, label }) {
        this.user = user;
        this.groupId = groupId;
        this.label = label;
    }
}

class GroupMemberJoined {
    constructor({ groupId, label, member, role }) {
        this.groupId = groupId;
        this.label = label;
        this.member = member;
        this.role = role;
    }
}

class UserInvited {
    constructor({ groupId, mail, invitedBy }) {
        this.groupId = groupId;
        this.mail = mail;
        this.invitedBy = invitedBy;
    }
}

class UserJoined {
    constructor({ user, groupId, role }) {
        this.user = user;
        this.groupId = groupId;
        this.role = role;
    }
}

module.exports = {
    NewUserRequested,
    UserCreated,
    GroupCreated,
    GroupRenamed,
    GroupMemberJoined,
    UserInvited,
    UserJoined
}

