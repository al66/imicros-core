/**
 * @module repositories/group.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Repository, Model } = require("../cqrs/cqrs");
 const clone = require("rfdc")();    // Really Fast Deep Clone

 /**
  * Repository
  */
  class GroupRepository extends Repository {
    forModel() { return Group }
}

/**
 * Model
 */
class Group extends Model {
    isAdmin({ user }) {
        if (user && user.uid) return this.state.members.find((member) => member.user.uid === user.uid && member.role === "admin");
        return false;
    }
    isMember({ user }) {
        if (user && user.uid) return this.state.members.find((member) => member.user.uid === user.uid);
        return false;
    }
    isLastAdmin({ user }) {
        if (user && user.uid) return !this.state.members.some((member) => member.user.uid !== user.uid  && member.role === "admin");
        return false;
    }
    hasMembers() {
        return ( this.state.members.length> 1 );
    }
    isMemberOrInvited({ email }) {
        if (this.state.members.find((member) => member.user.email === email)) return true;
        return  this.state.invitations?.indexOf(email) >= 0 ? true : false; 
    }
    isInvited({ email }) {
        return  this.state.invitations?.indexOf(email) >= 0 ? true : false; 
    }
    isPersistant() {
        return this.state.createdAt ? true : false;
    }
    isDeletionRequested () {
        return this.state.deletionRequest ? true : false;
    }
    isDeletionInProgress () {
        return this.state.deleted || ( this.state.deletionConfirmed ? true : false );
    }
    isDeleted ()  {
        return this.state.deleted;
    }
    isAdminGroup () {
        return this.state.adminGroup;
    }
    isServiceAccessGranted ({ service }) {
        return this.state.services?.find((s) => s === service) ? true : false;
    }
    getId () {
        return this.state.uid;
    }
    getLabel () {
        return this.state.label;
    }
    getMember ({ user }) {
        const member = this.state.members.find((member) => member.user.uid === user.uid);
        return clone({ member });
    }
    getCurrentState () {
        const currentState = clone(this.state)
        return currentState;
    }
    getKeys () {
        return this.state.keys;
    }
    getExpirationDays() {
        return this.state.keys.expirationDays;
    }
    onGroupCreated (event) {
        this.state.uid = event.groupId;
        this.state.createdAt = event.createdAt;
        this.state.label = event.label;
        this.state.adminGroup = event.admin || false;
        this.state.members = [];
        this.state.keys = {
            expirationDays: 30,
            default: null,
            store: {}
        };
    } 
    onGroupKeyRotate (event) {
        const def = {
            uid: event.keyId,
            key: event.key,
            iat: event.rotatedAt,
            exp: event.rotatedAt + ( 1000 * 60 * 60 * 24 * event.expirationDays )
        }
        this.state.keys.store[def.uid] = def;
        this.state.keys.default = def.uid;
    }
    onGroupRenamed (event) {
        this.state.label = event.label;
        // if(!event.$_fromHistory) console.log("Group Renamed", this.state.label);
    }
    onUserInvited (event) {
        if (!this.state.invitations) this.state.invitations = [];
        this.state.invitations.push(event.email); 
    }
    onUserUninvited (event) {
        if (!this.state.invitations) return;
        const index = this.state.invitations.indexOf(event.email);
        if (index !== -1) this.state.invitations.splice(index, 1);
    }
    onGroupMemberJoined (event) {
        this.state.members.push({ user: clone(event.member), role: event.role });
        if (this.state.invitations) {
            const index = this.state.invitations.indexOf(event.member?.email);
            if (index !== -1) this.state.invitations.splice(index, 1);
        }
    }
    onGroupMemberLeft (event) {
        this.state.members = this.state.members.filter(member => member.user.uid !== event.member?.uid);
    }
    onGroupMemberRemoved (event) {
        this.state.members = this.state.members.filter(member => member.user.uid !== event.userId);
    }
    onGroupInvitationRefused (event) {
        if (!this.state.invitations) return;
        const index = this.state.invitations.indexOf(event.email);
        if (index !== -1) this.state.invitations.splice(index, 1);
    }
    onGroupMemberNominatedForAdmin (event) {
        const member = this.state.members.find((member) =>  member.user.uid === event.member?.user?.uid);
        if (member) {
            member.request = {
                role: "admin",
                by: event.nominatedBy,
                at: event.nominatedAt
            }
        }
    }
    onGroupMemberNominationForAdminAccepted (event) {
        const member = this.state.members.find((member) =>  member.user.uid === event.userId);
        if (member && member.request?.role === "admin" ) {
            member.role = "admin";
            delete member.request;
        }
    }
    onGroupMemberNominationForAdminDeclined (event) {
        const member = this.state.members.find((member) => member.user.uid === event.userId);
        if (member && member.request?.role === "admin" ) delete member.request;
    }
    onGroupMemberNominationRemoved (event) {
        const member = this.state.members.find((member) => member.user.uid === event.member?.user?.uid);
        if (member && member.request?.role === "admin" ) delete member.request;
    }
    onGroupAdminRevokationRequested (event) {
        const member = this.state.members.find((member) => member.user.uid === event.member?.user?.uid  && member.role === "admin");
        if (member) {
            member.request = {
                revoke: true,
                newRole: event.newRole,
                by: event.member,
                at: event.requestedAt
            }
        }
    }
    onGroupAdminRevokationAccepted (event) {
        const member = this.state.members.find((member) => member.user.uid === event.userId);
        if (member && member.request?.revoke && member.request?.newRole) {
            member.role = member.request.newRole;
            delete member.request;
        }
    }
    onGroupAdminRevokationDeclined (event) {
        const member = this.state.members.find((member) => member.user.uid === event.userId);
        if (member && member.request?.revoke ) delete member.request;
    }
    onGroupAdminRevokationRemoved (event) {
        const member = this.state.members.find((member) => member.user.uid === event.member?.user?.uid);
        if (member && member.request?.revoke ) delete member.request;
    }
    
    onAgentCreated (event) {
        if (!this.state.agents) this.state.agents = {};
        this.state.agents[event.agentId] = {
            uid: event.agentId,
            label: event.label,
            createdAt: event.createdAt
        }
    }
    onAgentRenamed (event) {
        if (this.state.agents[event.agentId]) this.state.agents[event.agentId].label = event.label;
    }
    onAgentDeleted (event) {
        if (this.state.agents[event.agentId]) delete this.state.agents[event.agentId];
    }
    onGroupServiceAccessGranted (event) {
        if (!this.state.services) this.state.services = {};
        this.state.services[event.service] = {
            service: event.service,
            grantedBy: event.grantedBy,
            grantedAt: event.grantedAt
        }
    }
    onGroupDeletionRequested (event) {
        this.state.deletionRequest = {
            requestedBy: event.requestedBy,
            requestedAt: event.requestedAt
        }
    }
    onGroupDeletionCanceled (event) {
        delete this.state.deletionRequest;
    }
    onGroupDeletionConfirmed (event) {
        this.state.deletionConfirmed = {
            deletionToken: event.deletionToken,
            confirmedBy: event.confirmedBy,
            confirmedAt: event.confirmedAt
        }
    }
    onGroupDeleted (event) {
        this.state.deleted = true;
        this.state.deletedBy = event.deletedBy;
        this.state.deletedAt = event.deletedAt;
        this.state.members = [];
        this.state.agents = [];
    }
}

 module.exports = {
    GroupRepository
} 

