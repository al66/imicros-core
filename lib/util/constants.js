/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

class Constants {
    static get TOKEN_TYPE_USER() { return "userToken"; }
    static get TOKEN_TYPE_AGENT() { return "agentToken"; }
    static get TOKEN_TYPE_AUTH() { return "authToken"; }
    static get TOKEN_TYPE_MFA() { return "mfaToken"; }
    static get TOKEN_TYPE_RESET_PASSWORD() { return "resetToken"; }
    static get TOKEN_TYPE_USER_DELETION() { return "userDeletionToken"; }
    static get TOKEN_TYPE_GROUP_ACCESS() { return "accessToken"; }
    static get TOKEN_TYPE_ACCESS_INTERNAL() { return "accessTokenInternal"; }
    static get TOKEN_TYPE_INVITATION() { return "invitationToken"; }
    static get TOKEN_TYPE_GROUP_DELETION() { return "deletionToken"; }
}

module.exports = { Constants };