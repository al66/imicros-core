/**
 * @module events/user/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { EventHandler } = require("../../../cqrs/cqrs");
const { UserRepository } = require("../../repositories/user");
const { 
    UserCreated,
    UserInvited
} = require("../events");
const { 
    UserDoesNotExist,
    UserCreationFailed
} = require("../../exceptions/exceptions");

const { v4: uuid } = require("uuid");

/** 
 * Event Handler
 */
class UserCreatedHandler extends EventHandler {
    static forEvent () { return UserCreated }
    apply(even) {
         
    }
}
 
class UserInvitedHandler extends EventHandler {
    static forEvent () { return UserInvited }
    async apply(event) {
        const events = [];
        // prepare
        const repository = this.application.getRepository(UserRepository);
        const userId = await repository.preserveUniqueKey({ key: event.email, uid: uuid() })
        const user = await this.application.getModelById(UserRepository, userId);
        // apply event
        user.apply(event);
        // persist
        await user.commit();
        // return events
        return events;
    }
}
 
module.exports = {
    UserCreatedHandler,
    UserInvitedHandler
}