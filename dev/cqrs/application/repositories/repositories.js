/**
 * @module repositories/repositories.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { GroupRepository } = require("./group");
 const { AgentRepository } = require("./agent");
 const { UserRepository } = require("./user");

 module.exports = {
    GroupRepository,
    AgentRepository,
    UserRepository
 }