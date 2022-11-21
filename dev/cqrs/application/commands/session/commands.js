/**
 * @module commands/user/commands.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

class LogInUser {
    constructor({ email, password, sessionId }) {
        this.email = email;
        this.password = password;
        this.sessionId = sessionId;
    }
}
 
class LogOut {
    constructor({ authToken }) {
        this.authToken = authToken;
    }
}

class LoginMultiFactor {
    constructor({ mfaToken, sessionId }) {
        this.mfaToken = mfaToken;
        this.sessionId = sessionId;
    }
} 

module.exports = {
    LogInUser,
    LogOut
}