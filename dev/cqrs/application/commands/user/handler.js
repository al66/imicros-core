/**
 * @module commands/user/handler.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const crypto    = require("crypto");

const { CommandHandler } = require("../../../cqrs/cqrs");
const { UserRepository } = require("../../repositories/user");
const {
    RequestNewUser,
    RequestUserConfirmation,
    ConfirmUser,
    ChangeUserPassword,
    GenerateTOTP
} = require("./commands");
const { 
    UserCreated, 
    UserConfirmationRequested,
    UserConfirmed,
    UserPasswordChanged
} = require("../../events/events");
const { 
    UserAlreadyExists,
    UserDoesNotExist,
    UserNotYetConfirmed,
    UnvalidToken
} = require("../../exceptions/exceptions");

/** 
 * Command Handler
 */
class RequestNewUserHandler extends CommandHandler {
    static forCommand () { return RequestNewUser }
    async execute(command) {
        const events = [];
        // validate/prepeare command
        const repository = this.application.getRepository(UserRepository);
        const userId = await repository.preserveUniqueKey({ key: command.email, uid: command.userId })
        const user = await this.application.getModelById(UserRepository, userId);
        if (user.isPersistant()) throw new UserAlreadyExists({ email: command.email });
        const hashedPassword = crypto.createHash("sha256").update(command.password).digest("hex");
        // apply command
        events.push(user.apply(new UserCreated({ userId, email: command.email, passwordHash: hashedPassword, locale: command.locale })));
        // persist
        await user.commit();
        // return events
        return events;
    }
}

class RequestUserConfirmationHandler extends CommandHandler {
    static forCommand () { return RequestUserConfirmation }
    async execute(command) {
        const events = [];
        // validate/prepeare command
        const decoded = this.application.verifyJWT(command.authToken);
        const user = await this.application.getModelById(UserRepository, decoded.userId);
        if (!user.isActiveSession(decoded.sessionId))  throw new UnvalidToken({ token: command.authToken });
        if (user.isConfirmed()) throw new UserAlreadyConfirmed({ userId: user.state.uid });
        const confirmationToken = this.application.signedJWT({ type: "confirmationToken", userId: user.state.uid });
        // apply command
        events.push(user.apply(new UserConfirmationRequested({ userId: user.state.uid, confirmationToken })));
        // persist
        await user.commit();
        // return events
        return events;
    }
}

class ConfirmUserHandler extends CommandHandler {
    static forCommand () { return ConfirmUser }
    async execute (command) {
        const events = [];
        // validate/prepeare command
        const decoded = this.application.verifyJWT(command.confirmationToken);
        const user = await this.application.getModelById(UserRepository, decoded.userId);
        if (!user.isPersistant()) throw new UnvalidToken({ token: command.confirmationToken });
        if (user.isConfirmed()) throw new UserAlreadyConfirmed({ userId: user.state.uid });
        // apply command
        events.push(user.apply(new UserConfirmed({ userId: user.state.uid })));
        // persist
        await user.commit();
        // return events
        return events;
    }
}

class ChangeUserPasswordHandler extends CommandHandler {
    static forCommand () { return ChangeUserPassword }
    async execute (command) {
        const events = [];
        // validate/prepeare command
        const decoded = this.application.verifyJWT(command.authToken);
        const user = await this.application.getModelById(UserRepository, decoded.userId);
        if (!user.isActiveSession(decoded.sessionId))  throw new UnvalidToken({ token: command.authToken });
        if (!user.isConfirmed()) throw new UserNotYetConfirmed({ userId: user.state.uid });
        const hashedPassword = crypto.createHash("sha256").update(command.password).digest("hex");
        // apply command
        events.push(user.apply(new UserPasswordChanged({ userId: user.state.uid, passwordHash: hashedPassword })));
        // persist
        await user.commit();
        // return events
        return events;
    }
}

class GenerateTOTPHandler extends CommandHandler {
    static forCommand () { return GenerateTOTP }
    async execute (command) {
        const events = [];
        // validate/prepeare command
        const decoded = this.application.verifyJWT(command.authToken);
        const user = await this.application.getModelById(UserRepository, decoded.userId);
        if (!user.isActiveSession(decoded.sessionId))  throw new UnvalidToken({ token: command.authToken });
        // apply command
        
        // TODO
        // persist
        await user.commit();
        // return events
        return events;
    }
}

module.exports = {
    RequestNewUserHandler,
    RequestUserConfirmationHandler,
    ConfirmUserHandler,
    ChangeUserPasswordHandler,
    GenerateTOTPHandler
}
