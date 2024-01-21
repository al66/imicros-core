/**
 * @module exceptions/exceptions.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 class Exception extends Error {
   constructor(attributes = {}) {
       super("");
       // Error.captureStackTrace(this, this.constructor);
       // Error.captureStackTrace(this);
       this.message = this.constructor.name;
       for (const [attribute, value] of Object.entries(attributes)) this[attribute] = value;
   }
}

/** 
  * Exceptions
  */
  class AggregateHasBeenDeleted extends Exception {};
  class UserAlreadyExists extends Exception {};
  class UserDoesNotExist extends Exception {};
  class UserCreationFailed extends Exception {};
  class UserNotYetConfirmed extends Exception {};
  class WrongPassword extends Exception {};
  class GroupAlreadyExists extends Exception {};
  class GroupDoesNotExists extends Exception {};
  class NotAllowedForAdmins extends Exception {};
  class LastAdminOfGroup extends Exception {};
  class GroupHasOtherMembers extends Exception {};
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
  class UserIsGroupMember extends Exception {};
  class ServiceAccessNotAllowed extends Exception {};
  // exchange
  class UnvalidFetchToken extends Exception {};
  class AccessToReceiverNotGranted extends Exception {};
  class FailedToRetrieveMessage extends Exception {};
  
 module.exports = {
   AggregateHasBeenDeleted,
    UserAlreadyExists,
    UserDoesNotExist,
    UserCreationFailed,
    UserNotYetConfirmed,
    WrongPassword,
    GroupAlreadyExists,
    GroupDoesNotExists,
    NotAllowedForAdmins,
    LastAdminOfGroup,
    GroupHasOtherMembers,
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
    UnvalidRequest,
    UserIsGroupMember,
    ServiceAccessNotAllowed,
    UnvalidFetchToken,
    AccessToReceiverNotGranted,
    FailedToRetrieveMessage
 }  