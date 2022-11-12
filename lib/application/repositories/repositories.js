/**
 * @module repositories/repositories.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { GroupRepository } = require("./group");
 const { UserRepository } = require("./user");

 module.exports = {
    Repositories: [
        GroupRepository,
        UserRepository
    ]
 }