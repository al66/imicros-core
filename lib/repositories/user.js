/**
 * @module repositories/user.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Repository, Model } = require("../cqrs/cqrs");
 const clone = require("rfdc")();    // Really Fast Deep Clone

 /**
  * Repository
  */
class UserRepository extends Repository {
    forModel() { return User }
}

/**
 * Model
 */
class User extends Model {
    isPersistant() {
        return this.state.createdAt ? true : false;
    }
    isConfirmed() {
        return this.state.confirmedAt ? true : false;
    }
    isActiveSession(sessionId) {
        return this.state.activeSessions[sessionId] ? true : false;
    }
    isMultiFactorAuthentificationActive () {
        return this.state.enabledMFA ? true : false;
    }
    isDeletionRequested () {
        return this.state.deletionRequest ? true : false;
    }
    isDeletionInProgress () {
        return this.state.deleted || ( this.state.deletionConfirmed ? true : false );
    }
    isDeletionConfirmed () {
        return this.state.deletionConfirmed ? true : false;
    }
    getMultiFactorAuthentificationType () {
        return this.state.typeMFA || null; 
    }
    getPasswordHash () {
        return this.state.passwordHash;
    }
    getTokenData () {
        return {
            uid: this.state.uid,
            createdAt: this.state.createdAt,
            confirmedAt: this.state.confirmedAt,
            email: this.state.email,
            locale: this.state.locale        
        }
    }
    getCurrentState () {
        const currentState = clone(this.state);
        return currentState;
    }
    getEmail () {
        return this.state.email;
    }
    getLocale () {
        return this.state.locale;
    }
    getId () {
        return this.state.uid;
    }
    getMultiFactorAuthentificationSecret () {
        return this.state.secretMFA;
    }
    onUserWithPWARegistered (event) {
        this.state.uid = event.userId;
        this.state.createdAt = event.createdAt;
        this.state.email = event.email;
        this.state.passwordHash = event.passwordHash;
        this.state.locale = event.locale;
        this.state.groups = {};
        this.state.activeSessions = {};
    }
    onUserConfirmed (event) {
        this.state.confirmedAt = event.confirmedAt;
    }
    onUserLoggedIn (event) {
        this.state.lastLogInAt = event.loggedInAt;
        this.state.activeSessions[event.sessionId] = event.authToken; 
    }
    onUserLoggedOut (event) {
        delete this.state.activeSessions[event.sessionId];
    }
    onUserPasswordChanged (event) {
        this.state.passwordHash = event.passwordHash;
    }
    onUserInvited (event) {
        if (!this.state.invitations) this.state.invitations = {};
        this.state.invitations[event.groupId] = { label: event.label, invitationToken: event.invitationToken, invitedBy: event.invitedBy.email, invitedAt: event.invitedAt };
    }
    onUserUninvited (event) {
        if (this.state.invitations[event.groupId]) delete this.state.invitations[event.groupId];
    }
    onGroupMemberJoined (event) {
        if (this.state.groups[event.groupId]) {
            this.state.groups[event.groupId].label = event.label;
            this.state.groups[event.groupId].role = event.role
        } else {
            this.state.groups[event.groupId] = {
                groupId: event.groupId,
                label: event.label,
                role: event.role,
                joinedAt: event.joinedAt
            }
        }
        if (this.state.invitations && this.state.invitations[event.groupId]) {
            delete this.state.invitations[event.groupId];
        }
    }
    onGroupMemberLeft (event) {
        delete this.state.groups[event.groupId];
    }
    onGroupMemberRemoved (event) {
        delete this.state.groups[event.groupId];
    }
    onGroupInvitationRefused (event) {
        if (this.state.invitations[event.groupId]) delete this.state.invitations[event.groupId];
    }
    onGroupAliasSet (event) {
        if (this.state.groups[event.groupId]) {
            if (event.alias && event.alias.length > 0 ) {
                this.state.groups[event.groupId].alias = event.alias
            } else {
                delete this.state.groups[event.groupId].alias;
            }
        }
    }
    onGroupHiddenFlagToggled (event) {
        if (this.state.groups[event.groupId]) {
            this.state.groups[event.groupId].hide = event.hide
        }
    }
    onGroupDeletionRequested (event) {
        if (this.state.groups[event.groupId]) {
            this.state.groups[event.groupId].deletionRequested;
        }
    }
    onGroupDeletionCanceled (event) {
        if (this.state.groups[event.groupId]) {
            delete this.state.groups[event.groupId].deletionRequested;
        }
    }
    onGroupDeleted (event) {
        delete this.state.groups[event.groupId];
    }
    onGroupMemberNominatedForAdmin (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].role !== event.newRole) {
            this.state.groups[event.groupId].nominated = {
                newRole: event.newRole,
                nominatedBy: event.nominatedBy,
                nominatedAt: event.nominatedAt
            }
        }
    }
    onGroupMemberNominationForAdminAccepted (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].nominated?.newRole) {
            this.state.groups[event.groupId].role = this.state.groups[event.groupId].nominated.newRole
            delete this.state.groups[event.groupId].nominated
        }
    }
    onGroupMemberNominationForAdminDeclined (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].nominated) {
            delete this.state.groups[event.groupId].nominated
        }
    }
    onGroupMemberNominationRemoved (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].nominated) {
            delete this.state.groups[event.groupId].nominated
        }
    }
    onGroupAdminRevokationRequested (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].role !== event.newRole) {
            this.state.groups[event.groupId].request = {
                revoke: true,
                newRole: event.newRole,
                by: event.requestedBy,
                at: event.requestedAt
            }
        }
    }
    onGroupAdminRevokationAccepted (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].request?.newRole) {
            this.state.groups[event.groupId].role = this.state.groups[event.groupId].request.newRole
            delete this.state.groups[event.groupId].request
        }
    }
    onGroupAdminRevokationDeclined (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].request) {
            delete this.state.groups[event.groupId].request
        }
    }
    onGroupAdminRevokationRemoved (event) {
        if (this.state.groups[event.groupId] && this.state.groups[event.groupId].request) {
            delete this.state.groups[event.groupId].request
        }
    }
    onUserTOTPGenerated (event) {
        this.state.secretMFA = event.secret;
    }
    onMultiFactorAuthentificationActivated (event) {
        this.state.enabledMFA = true;
        this.state.typeMFA = event.typeMFA;
    }
    onUserDeletionRequested (event) {
        this.state.deletionRequest = {
            requestedAt: event.requestedAt
        }
    }
    onUserDeletionCanceled (event) {
        delete this.state.deletionRequest;
    }
    onUserDeletionConfirmed (event) {
        this.state.deletionConfirmed = {
            deletionToken: event.deletionToken,
            confirmedAt: event.confirmedAt
        }
    }
    onUserDeleted (event) {
        this.state.deleted = true;
        this.state.deletedAt = event.deletedAt;
        this.state.email = event.email;
        this.state.passwordHash = event.passwordHash;
        this.state.locale = event.locale;
        this.state.groups = {};
        this.state.activeSessions = {};
    }
}

 module.exports = {
    UserRepository,
    User
} 

