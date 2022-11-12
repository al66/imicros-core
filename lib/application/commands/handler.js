/**
 * @module commands/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const crypto = require("crypto");

 const { CommandHandler } = require("../../cqrs/cqrs");
 const { UserRepository } = require("../repositories/user");
 const { GroupRepository } = require("../repositories/group");
 const {
    RequestNewUser,
    CreateGroup,
    RenameGroup,
    InviteUser,
    JoinGroup
} = require("./commands");
const { 
    UserCreated,
    GroupCreated,
    GroupRenamed,
    GroupMemberJoined,
    UserInvited,
    UserJoined
} = require("../events/events");
const { 
    UserAlreadyExists,
    GroupAlreadyExists,
    GroupDoesNotExists,
    RequiresAdminRole
} = require("../exceptions/exceptions");

/** 
 * User Command Handler
 */
class RequestNewUserHandler extends CommandHandler {
    static forCommand () { return RequestNewUser }
    async execute(command) {
        const events = [];
        const repository = this.application.getRepository(UserRepository);
        // get current state
        const user = await this.application.getModelById(UserRepository, command.userId);
        // preparation
        const hashedPassword = crypto.createHash("sha256").update(command.password).digest("hex");
        // validate command
        if (user.state.createdAt) throw new UserAlreadyExists({ email: command.email });
        // apply command
        events.push(user.apply(new UserCreated({ userId: command.userId, email: command.email, passwordHash: hashedPassword, locale: command.locale })));
        // persist
        const result = await repository.updateUserMailIndex({ email: command.email, uid: command.userId });
        if (!result) throw new UserAlreadyExists({ email: command.email });
        await user.commit();
        // return events
        return events;
    }
}

 /** 
  * CommandHandler
  */
  class CreateGroupHandler extends CommandHandler {
    static forCommand () { return CreateGroup }
    async execute(command) {
        const events = [];
        // get current state
        const group = await this.application.getModelById(GroupRepository, command.groupId);
        // validate command
        if (group.state.createdAt) throw new GroupAlreadyExists({ uid: command.groupId });
        // apply command
        events.push(group.apply(new GroupCreated({ groupId: command.groupId, label: command.label })));
        events.push(group.apply(new GroupMemberJoined({ groupId: command.groupId, label: command.label, member: command.user, role: "admin" })));
        // persist
        await group.commit();
        // return events
        return events;
    }
}

class RenameGroupHandler extends CommandHandler {
    static forCommand () { return RenameGroup }
    async execute(command) {
        const events = [];
        // get current state
        const group = await this.application.getModelById(GroupRepository, command.groupId);
        // validate command
        if (!group.state.createdAt) throw new GroupDoesNotExists({ uid: command.groupId });
        if (!group.isAdmin({ user: command.user })) throw new RequiresAdminRole({ command: command.constructor.name });
        // apply command
        events.push(group.apply(new GroupRenamed({ user: command.user, groupId: command.groupId, label: command.label })));
        // persist
        await group.commit();
        // return events
        return events;
    }
}

module.exports = {
    RequestNewUserHandler,
    CreateGroupHandler,
    RenameGroupHandler,
    CommandHandlers: [
        RequestNewUserHandler,
        CreateGroupHandler,
        RenameGroupHandler
    ]
}
