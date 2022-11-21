/**
 * @module events/group/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { EventHandler } = require("../../../cqrs/cqrs");
 const { 
     GroupCreated,
     GroupRenamed,
     UserInvited,
     UserJoined,
     GroupMemberJoined
 } = require("./events");
 
 /** 
  * EventHandler
  */
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
     GroupMemberJoinedHandler
 }