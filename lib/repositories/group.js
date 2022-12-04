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
    getLabel() {
        return this.state.label;
    }
    getMember({ user }) {
        const member = this.state.members.find((member) => member.user.uid === user.uid);
        return clone({ member });
    }
    getCurrentState () {
        const currentState = clone(this.state)
        return currentState;
    }
    onGroupCreated (event) {
        this.state.uid = event.groupId;
        this.state.createdAt = event.createdAt;
        this.state.label = event.label;
        this.state.members = [];
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
}

 module.exports = {
    GroupRepository
} 

