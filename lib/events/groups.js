/**
 * @module events/group/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

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
        this.joinedAt = new Date().getTime();
    }
}
 
class UserInvited {
    constructor({ groupId, label, invitationToken, email, invitedBy }) {
        this.groupId = groupId;
        this.label = label;
        this.invitationToken = invitationToken;
        this.email = email;
        this.invitedBy = invitedBy;
        this.invitedAt = new Date().getTime();
    }
}

class UserUninvited {
    constructor({ groupId, email, uninvitedBy }) {
        this.groupId = groupId;
        this.email = email;
        this.uninvitedBy = uninvitedBy;
        this.uninvitedAt = new Date().getTime();
    }
}
 
 
class UserJoined {
    constructor({ user, groupId, role }) {
        this.user = user;
        this.groupId = groupId;
        this.role = role;
    }
}

// NewAgentRequested { groupId, agentId }


 
module.exports = {
    GroupCreated,
    GroupRenamed,
    GroupMemberJoined,
    UserInvited,
    UserUninvited,
    UserJoined
}
 
 