/**
 * @module exceptions/exceptions.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Exception } = require("../cqrs/cqrs");

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
  class RequiresUnrestrictedAccess extends Exception {};
  class OnlyAllowedForMembers extends Exception {};
  class UnvalidToken extends Exception {};
  class MultiFactorAuthentificationAlreadyActive extends Exception {};
  class UnvalidMultiFactorAuthentificationToken extends Exception {};
  class UserTOTPNotYetGenerated extends Exception {};
  class UserNotInvited extends Exception {};
  class AgentAlreadyExists extends Exception {}; 
  class AgentDoesNotExist extends Exception {};
  class UnvalidRequest extends Exception {};
  
 module.exports = {
    UserAlreadyExists,
    UserDoesNotExist,
    UserCreationFailed,
    UserNotYetConfirmed,
    WrongPassword,
    GroupAlreadyExists,
    GroupDoesNotExists,
    RequiresAdminRole,
    RequiresUnrestrictedAccess,
    OnlyAllowedForMembers,
    UnvalidToken,
    MultiFactorAuthentificationAlreadyActive,
    UnvalidMultiFactorAuthentificationToken,
    UserTOTPNotYetGenerated,
    UserNotInvited,
    AgentAlreadyExists,
    AgentDoesNotExist,
    UnvalidRequest
 }  