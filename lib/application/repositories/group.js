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

    }
    onGroupMemberJoined (event) {
        this.state.members.push({ user: event.member, role: event.role });
    }
}

 module.exports = {
    GroupRepository
} 

