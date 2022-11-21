/**
 * @module queries/session/queries.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

class verifyAuthToken {
    constructor({ authToken }) {
        this.authToken = authToken
    }
}

module.exports = {
    verifyAuthToken
}
