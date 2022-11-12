/**
 * @module events/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("../../cqrs/cqrs");
const { 
    NewUserRequested,
    GroupCreated,
    GroupMemberJoined,
    GroupRenamed,
    UserInvited,
    UserJoined
} = require("./events");

/** 
 * EventHandler
 */
class NewUserRequestedHandler extends EventHandler {
    static forEvent () { return NewUserRequested }
    apply(even) {
        
    }
}
class GroupMemberJoinedHandler extends EventHandler {
    static forEvent () { return GroupMemberJoined }
    apply(event) {
        // console.log("GroupMemberJoinedHandler called", event);
        // get user
        // apply event UserJoinedGroup
        // user commit
    } 
}

module.exports = {
    NewUserRequestedHandler,
    GroupMemberJoinedHandler,
    EventHandlers: [
        NewUserRequestedHandler,
        GroupMemberJoinedHandler
    ]
}