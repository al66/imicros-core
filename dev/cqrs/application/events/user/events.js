/**
 * @module events/user/events.js
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
// PasswordResetRequested
// PasswordReset
// TOTPGenerated
// TOTPActivated
// UserDeletionRequested
// UserDeleted

module.exports = {
    UserCreated,
    UserLoggedIn,
    UserMultiFactorRequested,
    UserLoggedOut,
    UserConfirmationRequested,
    UserConfirmed,
    UserPasswordChanged
}

