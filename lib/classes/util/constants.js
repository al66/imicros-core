/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

/* istanbul ignore file */
class Constants {

    // Auth: Token types
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
    static get TOKEN_TYPE_EXCHANGE_FETCH() { return "exchangeFetchToken"; }
    // Exchange: Box codes
    static get INBOX() { return 1; }
    static get OUTBOX() { return 2; }
    // Excghange: Pathes
    static get INBOX_PATH() { return "~inbox/"; }
    static get OUTBOX_PATH() { return "~outbox/"; }
    // Exchange: Status codes
    static get STATUS_SEND() { return 100; }
    static get STATUS_RECEIVE() { return 100; }
    static get STATUS_COMPLETE() { return 200; }
    // Exchange: Local
    static get LOCAL_URL() { return "local"; }
    // Exchange: Error codes
    static get ERROR_NOT_AUTHORIZED() { return 100; }
    static get ERROR_EXCHANGE_NOT_ACCEPTED() { return 101; }
    static get ERROR_ADD_MESSAGE_OUT() { return 102; }
    static get ERROR_SAVE_MESSAGE_OUT() { return 103; }
    static get ERROR_ADD_MESSAGE_IN() { return 104; }
    static get ERROR_REQUEST_ACCESS() { return 105; }
    static get ERROR_SAVE_MESSAGE_IN() { return 106; }
    static get ERROR_CONFIRM_MESSAGE_SENT() { return 107; }
    static get ERROR_UPDATE_WHITELIST() { return 108; }
    static get ERROR_DATABASE() { return 109; }
    static get ERROR_SAVE_APPENDIX_IN() { return 110; }
    static get ERROR_READ_MESSAGE() { return 111; }
    static get ERROR_EXCHANGE_NOTIFY() { return 112; }
    static get ERROR_EXCHANGE_VERIFY() { return 113; }
    static get ERROR_EXCHANGE_MESSAGE_EXISTS() { return 114; }
    static get ERROR_EXCHANGE_FETCH() { return 115; }

}

module.exports = { Constants };