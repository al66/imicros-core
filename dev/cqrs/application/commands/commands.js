/**
 * @module commands/commands.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

const UserCommands = require("./user/commands");
const SessionCommands = require("./session/commands");
const GroupCommands = require("./group/commands");
 

/**
 * Other commands
 */
// Login

module.exports = {
    ...UserCommands,
    ...SessionCommands,
    ...GroupCommands
}
