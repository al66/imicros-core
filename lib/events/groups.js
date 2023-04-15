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
 
class GroupMemberLeft {
    constructor({ groupId, member }) {
        this.groupId = groupId;
        this.member = member;
        this.leftAt = new Date().getTime();
    }
}

class GroupMemberRemoved {
    constructor({ groupId, userId }) {
        this.groupId = groupId;
        this.userId = userId;
        this.removedAt = new Date().getTime();
    }
}

class GroupInvitationRefused {
    constructor({ groupId, email }) {
        this.groupId = groupId;
        this.email= email;
        this.refusedAt = new Date().getTime();
    }
}

class GroupMemberNominatedForAdmin {
    constructor({ groupId, member, newRole, nominatedBy }) {
        this.groupId = groupId;
        this.member = member;
        this.newRole = newRole;
        this.nominatedBy = nominatedBy;
        this.nominatedAt = new Date().getTime();
    }
}

class GroupMemberNominationForAdminAccepted {
    constructor({ groupId, userId }) {
        this.groupId = groupId;
        this.userId = userId;
        this.acceptedAt = new Date().getTime();
    }
}

class GroupMemberNominationForAdminDeclined {
    constructor({ groupId, userId }) {
        this.groupId = groupId;
        this.userId = userId;
        this.declinedAt = new Date().getTime();
    }
}

class GroupMemberNominationRemoved {
    constructor({ groupId, member, removedBy }) {
        this.groupId = groupId;
        this.member = member;
        this.removedBy = removedBy;
        this.removedAt = new Date().getTime();
    }
}

class GroupAdminRevokationRequested {
    constructor({ groupId, member, newRole, requestedBy }) {
        this.groupId = groupId;
        this.member = member;
        this.newRole = newRole;
        this.requestedBy = requestedBy;
        this.requestedAt = new Date().getTime();
    }
}

class GroupAdminRevokationAccepted {
    constructor({ groupId, userId }) {
        this.groupId = groupId;
        this.userId = userId;
        this.acceptedAt = new Date().getTime();
    }
}

class GroupAdminRevokationDeclined {
    constructor({ groupId, userId }) {
        this.groupId = groupId;
        this.userId = userId;
        this.declinedAt = new Date().getTime();
    }
}

class GroupAdminRevokationRemoved {
    constructor({ groupId, member, removedBy }) {
        this.groupId = groupId;
        this.member = member;
        this.removedBy = removedBy;
        this.removedAt = new Date().getTime();
    }
}

class GroupKeyRotate {
    constructor({ groupId, keyId, key, expirationDays }) {
        this.groupId = groupId;
        this.keyId = keyId;
        this.key = key;
        this.expirationDays = expirationDays
        this.rotatedAt = new Date().getTime();
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

class GroupDeletionRequested {
    constructor({ groupId, deletionToken, requestedBy }) {
        this.groupId = groupId;
        this.requestedBy = requestedBy;
        this.requestedAt = new Date().getTime();
    }
}

class GroupDeletionChecked {
    constructor({ groupId, deletionToken, allowed }) {
        this.groupId = groupId;
        this.allowed = allowed;
        this.deletionToken = deletionToken;
        this.arrivedAt = new Date().getTime();
    }
}

class GroupDeletionCanceled {
    constructor({ groupId, canceledBy }) {
        this.groupId = groupId;
        this.canceledBy = canceledBy;
        this.canceledAt = new Date().getTime();
    }
}

class GroupDeletionConfirmed {
    constructor({ groupId, deletionToken, confirmedBy }) {
        this.groupId = groupId;
        this.deletionToken = deletionToken;
        this.confirmedBy = confirmedBy;
        this.confirmedAt = new Date().getTime();
    }
}

class GroupDeleted {
    constructor({ groupId, deletionToken, lastAdmin }) {
        this.groupId = groupId;
        this.deletionToken = deletionToken;
        this.lastAdmin = lastAdmin;
        this.deletedAt = new Date().getTime();
    }
}
 
module.exports = {
    GroupCreated,
    GroupRenamed,
    GroupMemberJoined,
    GroupMemberLeft,
    GroupMemberRemoved,
    GroupInvitationRefused,
    GroupMemberNominatedForAdmin,
    GroupMemberNominationForAdminAccepted,
    GroupMemberNominationForAdminDeclined,
    GroupMemberNominationRemoved,
    GroupAdminRevokationRequested,
    GroupAdminRevokationAccepted,
    GroupAdminRevokationDeclined,
    GroupAdminRevokationRemoved,
    GroupKeyRotate,
    UserInvited,
    UserUninvited,
    UserJoined,
    GroupDeletionRequested,
    GroupDeletionChecked,
    GroupDeletionCanceled,
    GroupDeletionConfirmed,
    GroupDeleted
}
 
 