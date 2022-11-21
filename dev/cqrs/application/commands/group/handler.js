/**
 * @module commands/group/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { CommandHandler } = require("../../../cqrs/cqrs");
 const { GroupRepository } = require("../../repositories/group");
 const {
    CreateGroup,
    RenameGroup,
    InviteUser,
    JoinGroup
} = require("./commands");
const { 
    GroupCreated,
    GroupRenamed,
    GroupMemberJoined,
    UserInvited,
    UserJoined
} = require("../../events/events");
const { 
    GroupAlreadyExists,
    GroupDoesNotExists,
    RequiresAdminRole
} = require("../../exceptions/exceptions");

/** 
 * Command Handler
 */
class CreateGroupHandler extends CommandHandler {
    static forCommand () { return CreateGroup }
    async execute(command) {
        const events = [];
        // validate command
        const decoded = this.application.verifyJWT(command.userToken);
        const group = await this.application.getModelById(GroupRepository, command.groupId);
        if (group.state.createdAt) throw new GroupAlreadyExists({ uid: command.groupId });
        // apply command
        events.push(group.apply(new GroupCreated({ groupId: command.groupId, label: command.label })));
        events.push(group.apply(new GroupMemberJoined({ groupId: command.groupId, label: command.label, member: decoded.user, role: "admin" })));
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
        // validate command
        const decoded = this.application.verifyJWT(command.userToken);
        const group = await this.application.getModelById(GroupRepository, command.groupId);
        if (!group.state.createdAt) throw new GroupDoesNotExists({ uid: command.groupId });
        if (!group.isAdmin({ user: decoded.user })) throw new RequiresAdminRole({ command: command.constructor.name });
        // apply command
        events.push(group.apply(new GroupRenamed({ user: decoded.user, groupId: command.groupId, label: command.label })));
        // persist
        await group.commit();
        // return events
        return events;
    }
}

class InviteUserHandler extends CommandHandler {
    static forCommand () { return InviteUser }
    async execute(command) {
        const events = [];
        // validate/prepare command
        const decoded = this.application.verifyJWT(command.userToken);
        const group = await this.application.getModelById(GroupRepository, command.groupId);
        if (!group.isAdmin({ user: decoded.user })) throw new RequiresAdminRole({ command: command.constructor.name });
        const invitationToken = this.application.signedJWT({ 
            type: "invitationToken", 
            groupId: command.groupId, 
            email: command.email, 
            invitedBy: {
                uid: decoded.user.uid,
                email: decoded.user.email
            }
        });
        // apply command
        events.push(group.apply(new UserInvited({ 
            groupId: command.groupId, 
            label: group.getLabel(), 
            email: command.email, 
            invitationToken, 
            invitedBy: {
                uid: decoded.user.uid,
                email: decoded.user.email
            }
        })));
        // persist
        await group.commit();
        // return events
        return events;
    }
}

module.exports = {
    CreateGroupHandler,
    RenameGroupHandler,
    InviteUserHandler
}
