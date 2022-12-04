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
        this.state.lastLogInAt = event.LoggedInAt;
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
    onUserTOTPGenerated (event) {
        this.state.secretMFA = event.secret;
    }
    onMultiFactorAuthentificationActivated (event) {
        this.state.enabledMFA = true;
        this.state.typeMFA = event.typeMFA;
    }
}

 module.exports = {
    UserRepository,
    User
} 

