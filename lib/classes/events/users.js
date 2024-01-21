/**
 * @module events/user/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

/** 
 * User Events
 */

class UserWithPWARegistered {
    constructor({ userId, email, passwordHash, locale }) {
        this.userId = userId;
        this.email = email;
        this.passwordHash = passwordHash;
        this.locale = locale;
        this.createdAt = new Date().getTime();
    }
}
class UserLoggedIn {
    constructor({ userId, authToken, sessionId, locale }) {
        this.userId = userId;
        this.authToken = authToken;
        this.sessionId = sessionId;
        this.locale = locale;
        this.loggedInAt = new Date().getTime();
    }
}
class UserMultiFactorRequested {
    constructor({ userId, mfaToken, locale }) {
        this.userId = userId;
        this.mfaToken = mfaToken;
        this.locale = locale;
        this.requestedAt = new Date().getTime();
    }
}
class UserLoggedOut {
    constructor({ userId, authToken, sessionId }) {
        this.userId = userId;
        this.authToken = authToken;
        this.sessionId = sessionId;
        this.loggedOutAt = new Date().getTime();
    }
}
class UserConfirmationRequested {
    constructor({ userId, confirmationToken }) {
        this.userId = userId;
        this.confirmationToken = confirmationToken;
        this.requestedAt = new Date().getTime();
    }
}
class UserConfirmed {
    constructor({ userId }) {
        this.userId = userId;
        this.confirmedAt = new Date().getTime();
    }
}
class UserPasswordChanged {
    constructor({ userId, passwordHash }) {
        this.userId = userId;
        this.passwordHash = passwordHash;
        this.changedAt = new Date().getTime();
    }
}

class UserPasswordResetRequested {
    constructor({ userId, email, locale, resetToken }) {
        this.userId = userId;
        this.email = email;
        this.locale = locale;
        this.resetToken = resetToken;
        this.requestedAt = new Date().getTime();
    }
}
class UserTOTPGenerated {
    constructor({ userId, secret }) {
        this.userId = userId;
        this.secret = secret;
        this.generatedAt = new Date().getTime();
    }
}
class MultiFactorAuthentificationActivated {
    constructor({ userId, typeMFA }) {
        this.userId = userId;
        this.typeMFA = typeMFA;
        this.activatedAt = new Date().getTime();
    }
}
class GroupAliasSet {
    constructor({ userId, groupId, alias }) {
        this.userId = userId;
        this.groupId = groupId;
        this.alias = alias;
        this.setAt = new Date().getTime();
    }
}
class GroupHiddenFlagToggled {
    constructor({ userId, groupId, hide }) {
        this.userId = userId;
        this.groupId = groupId;
        this.hide = hide;
        this.toggledAt = new Date().getTime();
    }
}
class UserDeletionRequested {
    constructor({ userId }) {
        this.userId = userId;
        this.requestedAt = new Date().getTime();
    }
}
class UserDeletionCanceled {
    constructor({ userId }) {
        this.userId = userId;
        this.canceledAt = new Date().getTime();
    }
}
class UserDeletionConfirmed {
    constructor({ userId, deletionToken }) {
        this.userId = userId;
        this.deletionToken = deletionToken;
        this.confirmedAt = new Date().getTime();
    }
}
class UserDeleted {
    constructor({ userId, deletionToken }) {
        this.userId = userId;
        this.deletionToken = deletionToken;
        this.deletedAt = new Date().getTime();
    }
}

// TOTPActivated
// UserDeleted

module.exports = {
    UserWithPWARegistered,
    UserLoggedIn,
    UserMultiFactorRequested,
    UserLoggedOut,
    UserConfirmationRequested,
    UserConfirmed,
    UserPasswordChanged,
    UserPasswordResetRequested,
    UserTOTPGenerated,
    MultiFactorAuthentificationActivated,
    GroupAliasSet,
    GroupHiddenFlagToggled,
    UserDeletionRequested,
    UserDeletionCanceled,
    UserDeletionConfirmed,
    UserDeleted
}

