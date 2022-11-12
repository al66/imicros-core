/**
 * @module exceptions/exceptions.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Exception } = require("../../cqrs/cqrs");

 /** 
  * Exceptions
  */
  class UserAlreadyExists extends Exception {};
  class GroupAlreadyExists extends Exception {};
  class GroupDoesNotExists extends Exception {};
  class RequiresAdminRole extends Exception {};
  class OnlyAllowedForMembers extends Exception {};
  
 module.exports = {
    UserAlreadyExists,
    GroupAlreadyExists,
    GroupDoesNotExists,
    RequiresAdminRole,
    OnlyAllowedForMembers,
    Exceptions: [
        GroupAlreadyExists,
        GroupDoesNotExists,
        RequiresAdminRole,
        OnlyAllowedForMembers
    ]
 }  