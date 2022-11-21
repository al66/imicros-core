/**
 * @module repositories/group.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Repository, Model } = require("../../cqrs/cqrs");

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
    isPersistant() {
        return this.state.createdAt ? true : false;
    }
    getLabel() {
        return this.state.label;
    }
    getCurrentState () {
        return this.state;
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
    onGroupMemberJoined (event) {
        this.state.members.push({ user: event.member, role: event.role });
    }
}

 module.exports = {
    GroupRepository
} 

