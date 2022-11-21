/**
 * @module commands/user/commands.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

class RequestNewUser {
    constructor({ userId, email, password, locale }) {
        this.userId = userId;
        this.email = email;
        this.password = password;
        this.locale = locale;
    }
}

class RequestUserConfirmation {
    constructor({ authToken }) {
        this.authToken = authToken;
    }
}
class ConfirmUser {
    constructor({ confirmationToken }) {
        this.confirmationToken = confirmationToken;
    }
}
class ChangeUserPassword {
    constructor({ authToken, password }) {
        this.authToken = authToken;
        this.password = password;
    }
}

class GenerateTOTP {
    constructor({ authToken }) {
        this.authToken = authToken;
    }
}

// RequestUserPasswordReset
// ResetPassword
// generateTOTP
// activateTOTP
// RequestDeleteUser
// DeleteUser
class RequestNewGroup {
    constructor({ authToken, groupId, label }) {
        this.authToken = authToken;
        this.groupId = groupId;
        this.label = label;
    }
}

module.exports = {
    RequestNewUser,
    RequestUserConfirmation,
    ConfirmUser,
    ChangeUserPassword,
    GenerateTOTP,
    
    RequestNewGroup    
}