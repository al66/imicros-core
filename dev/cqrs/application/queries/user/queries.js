/**
 * @module queries/user/queries.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

/** 
 * Queries
 */
class GetUser {
    constructor({ authToken }) {
        this.authToken = authToken;
    }
}
 
module.exports = {
    GetUser
}
 