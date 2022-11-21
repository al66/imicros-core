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
  class UserDoesNotExist extends Exception {};
  class UserCreationFailed extends Exception {};
  class UserNotYetConfirmed extends Exception {};
  class WrongPassword extends Exception {};
  class GroupAlreadyExists extends Exception {};
  class GroupDoesNotExists extends Exception {};
  class RequiresAdminRole extends Exception {};
  class OnlyAllowedForMembers extends Exception {};
  class UnvalidToken extends Exception {};
  
 module.exports = {
    UserAlreadyExists,
    UserDoesNotExist,
    UserCreationFailed,
    UserNotYetConfirmed,
    WrongPassword,
    GroupAlreadyExists,
    GroupDoesNotExists,
    RequiresAdminRole,
    OnlyAllowedForMembers,
    UnvalidToken
 }  