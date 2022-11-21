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
    LogInUser,
    LogOut
} = require("./commands");
const { 
    UserLoggedIn,
    UserLoggedOut
} = require("../../events/events");
const { 
    UserDoesNotExist,
    UserNotYetConfirmed,
    WrongPassword,
    UnvalidToken
} = require("../../exceptions/exceptions");
 
/** 
 * Command Handler
 */
class LogInUserHandler extends CommandHandler {
    static forCommand () { return LogInUser }
    async execute(command) {
        const events = [];
        // validate/prepeare command
        const repository = this.application.getRepository(UserRepository);
        const userId = await repository.preserveUniqueKey({ key: command.email });
        if (!userId) throw new UserDoesNotExist({ email: command.email });
        const user = await this.application.getModelById(UserRepository, userId);
        if (!user.isPersistant()) throw new UserDoesNotExist({ email: command.email });
        const hashedPassword = crypto.createHash("sha256").update(command.password).digest("hex");
        if (user.getPasswordHash() !== hashedPassword) throw new WrongPassword({});
        if (user.isMultiFactorAuthentificationActive()) {
            const typeMFA = user.getMultiFactorAuthentificationType();
            const mfaToken = this.application.signedJWT({ type: "mfaToken", typeMFA, userId: user.state.uid, sessionId: command.sessionId });
            // apply command
            events.push(user.apply(new UserMultiFactorRequested({ userId: user.state.uid, mfaToken, typeMFA, locale: user.state.locale })));
        } else {
            const authToken = this.application.signedJWT({ type: "authToken", userId: user.state.uid, sessionId: command.sessionId });
            // apply command
            events.push(user.apply(new UserLoggedIn({ userId: user.state.uid, authToken, sessionId: command.sessionId, locale: user.state.locale })));
        }
        // persist
        await user.commit();
        // return events
        return events;
    }
}

class LogOutHandler extends CommandHandler {
    static forCommand () { return LogOut }
    async execute(command) {
        const events = [];
        // validate/prepeare command
        const decoded = this.application.verifyJWT(command.authToken);
        const user = await this.application.getModelById(UserRepository, decoded.userId);
        if (!user || !user.isPersistant()) throw new UnvalidToken({ token: command.authToken });
        // apply command
        events.push(user.apply(new UserLoggedOut({ userId: user.state.uid, authToken: command.authToken, sessionId: decoded.sessionId })));
        // persist
        await user.commit();
        // return events
        return events;
    }
}

module.exports = {
    LogInUserHandler,
    LogOutHandler
}
 