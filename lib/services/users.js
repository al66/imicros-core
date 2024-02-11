/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { 
    UserWithPWARegistered, 
    UserConfirmationRequested,
    UserConfirmed,
    UserPasswordChanged,
    UserPasswordResetRequested,
    UserLoggedIn,
    UserLoggedOut,
    UserMultiFactorRequested,
    UserInvited,
    UserUninvited,
    GroupMemberJoined,
    GroupMemberLeft,
    GroupMemberRemoved,
    GroupInvitationRefused,
    GroupMemberNominatedForAdmin,
    GroupMemberNominationForAdminAccepted,
    GroupMemberNominationForAdminDeclined,
    GroupMemberNominationRemoved,
    GroupAdminRevokationRequested,
    GroupAdminRevokationAccepted,
    GroupAdminRevokationDeclined,
    GroupAdminRevokationRemoved,
    GroupDeletionRequested,
    GroupDeletionCanceled,
    GroupDeleted,
    UserTOTPGenerated,
    MultiFactorAuthentificationActivated,
    GroupAliasSet,
    GroupHiddenFlagToggled,
    UserDeletionRequested,
    UserDeletionCanceled,
    UserDeletionConfirmed,
    UserDeleted
} = require("../classes/events/events");

const { 
    UserAlreadyExists,
    UserDoesNotExist,
    UserCreationFailed,
    UserNotYetConfirmed,
    WrongPassword,
    UnvalidToken,
    MultiFactorAuthentificationAlreadyActive,
    UnvalidMultiFactorAuthentificationToken,
    UserTOTPNotYetGenerated,
    UserIsGroupMember
} = require("../classes/exceptions/exceptions");

const { UserRepository } = require("../classes/repositories/repositories");
const { Constants } = require("../classes/util/constants");
const TOTP = require("../modules/mfa/totp");
const { v4: uuid } = require("uuid");

module.exports = {
    name: "users",
    version: 1,

    /**
     * Service settings
     */
    settings: {},

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    dependencies: [],	
 
    /**
     * Actions
     */
    actions: {

        // ********** Commands ************
        
        /**
         * Register a new user with PWA
         * 
         * @command
         * @param {Email} email
         * @param {String} password 
         * 
         * @emits UserWithPWARegistered
         * 
         * @throws UserAlreadyExists
         * 
         * @returns {Object} result - exceptional case, where command returns data of the applied event! 
         */
        registerPWA: {
            params: {
                userId: { type: "string"},
                email: { type: "email" },
                password: { type: "string", min: 8 },
                locale: { type: "string", min: 2, max:4, pattern: /^[a-zA-Z]+$/, optional: true }
            },			
            async handler(ctx) {
                const events = [];
                const userId = await this.userRepository.preserveUniqueKey({ key: ctx.params.email, uid: ctx.params.userId })
                const user = await this.userRepository.getById({ uid: userId });
                if (user.isPersistant()) throw new UserAlreadyExists({ email: ctx.params.email });
                const hashedPassword = this.encryption.getHash(ctx.params.password);
                // apply command
                events.push(user.apply(new UserWithPWARegistered({ userId, email: ctx.params.email, passwordHash: hashedPassword, locale: ctx.params.locale })));
                // persist
                await user.commit();
                // return result
                return {
                    userId
                };
            }
        },

        /**
         * Login user with password
         * 
         * @command
         * @param {Email} email
         * @param {String} password 
         * 
         * @emits UserLoggedIn
         * @emits UserMultiFactorRequested
         * 
         * @throws UserDoesNotExist
         * @throws WrongPassword
         * 
         * @returns {Object} result - exceptional case, where command returns data of the applied event! 
         */
        logInPWA: {
            params: {
                sessionId: { type: "uuid"},
                email: { type: "email" },
                password: { type: "string", min: 8 }
            },
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const userId = await this.userRepository.preserveUniqueKey({ key: ctx.params.email });
                if (!userId) throw new UserDoesNotExist({ email: ctx.params.email });
                const user = await this.userRepository.getById({ uid: userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ email: ctx.params.email });
                const hashedPassword = this.encryption.getHash(ctx.params.password);
                if (user.getPasswordHash() !== hashedPassword) throw new WrongPassword({});
                let authObject = {};
                if (user.isMultiFactorAuthentificationActive()) {
                    const typeMFA = user.getMultiFactorAuthentificationType();
                    const mfaToken = await this.encryption.sign({ 
                        payload: { 
                            type: Constants.TOKEN_TYPE_MFA, 
                            typeMFA, 
                            userId: user.state.uid, 
                            sessionId: ctx.params.sessionId
                        }, options: {}
                    });
                    // apply command
                    events.push(user.apply(new UserMultiFactorRequested({ userId: user.state.uid, mfaToken: mfaToken.token, typeMFA, locale: user.state.locale })));
                    authObject = {
                        mfaToken: mfaToken.token,
                        typeMFA, 
                        locale: user.state.locale
                    }
                } else {
                    const authToken = await this.encryption.sign({ 
                        payload: { 
                            type: Constants.TOKEN_TYPE_AUTH,
                            userId: user.state.uid, 
                            sessionId: ctx.params.sessionId 
                        }, options: {}
                    });
                    // apply command
                    events.push(user.apply(new UserLoggedIn({ userId: user.state.uid, authToken: authToken.token, sessionId: ctx.params.sessionId, locale: user.state.locale })));
                    authObject = {
                        authToken: authToken.token,
                        sessionId: ctx.params.sessionId, 
                        locale: user.state.locale
                    }
                }
                // persist
                await user.commit();
                // return result
                return authObject;
            }
        },

        /**
         * Log out user
         * 
         * @command
         * 
         * @emits UserLoggedOut
         * 
         * @throws UnvalidToken
         * 
         * @returns {Boolean} accepted
         */
        logOut: {
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const { user, decoded } = await this.getUser(ctx);
                // apply command
                events.push(user.apply(new UserLoggedOut({ userId: user.state.uid, authToken: ctx.meta?.authToken, sessionId: decoded.payload.sessionId })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * Request confirmation
         * 
         * @command
         * 
         * @emits UserConfirmationRequested
         * 
         * @throws UnvalidToken
         * @throws UserAlreadyConfirmed
         * 
         * @returns {Boolean} accepted
         */
        requestConfirmation: {
            async handler(ctx) {
                const events = [];
                const { user } = await this.getUser(ctx);
                if (user.isConfirmed()) throw new UserAlreadyConfirmed({ userId: user.state.uid });
                const confirmationTokenSigned = await this.encryption.sign({ payload: { type: "confirmationToken", userId: user.state.uid } });
                // apply command
                events.push(user.apply(new UserConfirmationRequested({ userId: user.state.uid, confirmationToken: confirmationTokenSigned.token })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * Confirm user
         * 
         * @command
         * @param {String} confirmationToken 
         * 
         * @emits UserConfirmed
         * 
         * @throws UnvalidToken
         * @throws UserAlreadyConfirmed
         * 
         * @returns {Boolean} accepted
         */
        confirm: {
            params: {
                confirmationToken: { type: "string" }
            },
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const decoded = await this.encryption.verify({ token: ctx.params.confirmationToken });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                if (!user.isPersistant()) throw new UnvalidToken({ token: ctx.params.confirmationToken });
                if (user.isConfirmed()) throw new UserAlreadyConfirmed({ userId: user.state.uid });
                // apply command
                events.push(user.apply(new UserConfirmed({ userId: user.state.uid })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * Change password
         * 
         * @command
         * @param {String} password 
         * 
         * @emits UserPasswordChanged
         * 
         * @throws UnvalidToken
         * @throws UserNotYetConfirmed
         * 
         * @returns {Boolean} accepted
         */
         changePassword: {
            params: {
                oldPassword: { type: "string" },
                newPassword: { type: "string", min: 8 }
            },
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const { user } = await this.getUser(ctx);
                if (!user.isConfirmed()) throw new UserNotYetConfirmed({ userId: user.state.uid });
                const hashedOldPassword = this.encryption.getHash(ctx.params.oldPassword);
                if (user.getPasswordHash() !== hashedOldPassword) throw new WrongPassword({});
                const hashedNewPassword = this.encryption.getHash(ctx.params.newPassword);
                // apply command
                events.push(user.apply(new UserPasswordChanged({ userId: user.state.uid, passwordHash: hashedNewPassword })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * generate TOTP secret for the logged in user
         * 
         * @command
         * 
         * @emits UserTOTPGenerated
         * 
         * @throws MultiFactorAuthentificationAlreadyActive
         * 
         * @returns {Boolean} accepted
         */
        generateTOTP: {
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const { user } = await this.getUser(ctx);
                if (user.isMultiFactorAuthentificationActive()) throw new MultiFactorAuthentificationAlreadyActive({ userId: user.state.uid });
                const secret = TOTP.generateSecret({ name: user.getEmail(), issuer: this.issuerTOTP });
                const encrypted = await this.encryption.encryptData(secret);
                // apply command
                events.push(user.apply(new UserTOTPGenerated({ userId: user.state.uid, secret: encrypted })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * activate MFA with TOTP
         * 
         * @command
         * @param {String} totp 
         * 
         * @emits MultiFactorAuthentificationActivated
         * 
         * @throws MultiFactorAuthentificationAlreadyActive
         * @throws UserTOTPNotYetGenerated
         * @throws UnvalidMultiFactorAuthentificationToken
         * 
         * @returns {Boolean} accepted
         */
        activateTOTP: {
            params: {
                totp: { type: "string" }
            },
            async handler (ctx) {
                const events = [];
                // validate/prepeare command
                const { user } = await this.getUser(ctx);
                if (user.isMultiFactorAuthentificationActive()) throw new MultiFactorAuthentificationAlreadyActive({ userId: user.state.uid });
                const encrypted = user.getMultiFactorAuthentificationSecret();
                if (!encrypted) throw new UserTOTPNotYetGenerated({ userId: user.state.uid });
                const secret = await this.encryption.decryptData(encrypted);
                const options = {
                    secret: secret.ascii,
                    window: 0,
                    token: ctx.params.totp
                }
                if (!TOTP.totp.verify(options)) throw new UnvalidMultiFactorAuthentificationToken({ token: ctx.params.totp });
                // apply command
                events.push(user.apply(new MultiFactorAuthentificationActivated({ userId: user.state.uid, typeMFA: "TOTP" })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * log in with TOTP as requested with MFA token
         * 
         * @command
         * @param {String} MFA token (returned on PWA login) 
         * @param {String} totp 
         * 
         * @emits MultiFactorAuthentificationActivated
         * 
         * @throws MultiFactorAuthentificationAlreadyActive
         * @throws UserTOTPNotYetGenerated
         * @throws UnvalidMultiFactorAuthentificationToken
         * 
         * @returns {Boolean} accepted
         */
        logInTOTP: {
            params: {
                mfaToken: { type: "string" },
                totp: { type: "string" }
            },
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const decoded = await this.encryption.verify({ token: ctx.params.mfaToken });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                const sessionId = decoded.payload.sessionId;
                const encrypted = user.getMultiFactorAuthentificationSecret();
                if (!encrypted) throw new UserTOTPNotYetGenerated({ userId: user.state.uid });
                const secret = await this.encryption.decryptData(encrypted);
                const options = {
                    secret: secret.ascii,
                    window: 0,
                    token: ctx.params.totp
                }
                if (!TOTP.totp.verify(options)) throw new UnvalidMultiFactorAuthentificationToken({ token: ctx.params.totp });
                const authToken = await this.encryption.sign({ 
                    payload: { 
                        type: Constants.TOKEN_TYPE_AUTH, 
                        userId: user.state.uid, 
                        sessionId 
                    }, options: {}
                });
                // apply command
                events.push(user.apply(new UserLoggedIn({ userId: user.state.uid, authToken: authToken.token, sessionId, locale: user.state.locale })));
                const authObject = {
                    authToken: authToken.token,
                    sessionId, 
                    locale: user.state.locale
                }
                // persist
                await user.commit();
                // return result
                return authObject;
            }
        },

        /**
         * request password reset (to trigger an email to the user)
         * 
         * @command
         * @param {String} email 
         * @param {String} totp - only required, if MFA is activated for the user
         * 
         * @emits UserPasswordResetRequested
         * 
         * @throws UserDoesNotExist
         * @throws UserTOTPNotYetGenerated
         * @throws UnvalidMultiFactorAuthentificationToken
         * 
         * @returns {Boolean} accepted
         */
        requestPasswordReset: {
            params: {
                email: { type: "email" },
                totp: { type: "string", optional: true }
            },
            async handler (ctx) {
                const events = [];
                // validate/prepeare command
                const userId = await this.userRepository.preserveUniqueKey({ key: ctx.params.email });
                if (!userId) throw new UserDoesNotExist({ email: ctx.params.email });
                const user = await this.userRepository.getById({ uid: userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ email: ctx.params.email });
                if (user.isMultiFactorAuthentificationActive()) {
                    if (!ctx.params.totp) throw new UnvalidMultiFactorAuthentificationToken({ token: ctx.params.totp });
                    const encrypted = user.getMultiFactorAuthentificationSecret();
                    if (!encrypted) throw new UserTOTPNotYetGenerated({ userId: user.state.uid });
                    const secret = await this.encryption.decryptData(encrypted);
                    const options = {
                        secret: secret.ascii,
                        window: 0,
                        token: ctx.params.totp
                    }
                    if (!TOTP.totp.verify(options)) throw new UnvalidMultiFactorAuthentificationToken({ token: ctx.params.totp });
                }
                const tokenData = user.getTokenData();
                const { token } = await this.encryption.sign({ 
                    payload: { 
                        type: Constants.TOKEN_TYPE_RESET_PASSWORD, 
                        userId: tokenData.uid, 
                        email: tokenData.email,
                        locale: tokenData.locale
                    }, options: {
                        expiresIn: "1h"
                    }
                });
                // apply command
                events.push(user.apply(new UserPasswordResetRequested({ 
                    userId: tokenData.uid, 
                    email: tokenData.email,
                    locale: tokenData.locale,
                    resetToken: token 
                })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * reset password
         * 
         * @command
         * @param {String} resetToken (as received via email) 
         * @param {String} newPassword 
         * @param {String} totp - only required, if MFA is activated for the user
         * 
         * @emits UserPasswordChanged
         * 
         * @throws UserDoesNotExist
         * @throws UserTOTPNotYetGenerated
         * @throws UnvalidMultiFactorAuthentificationToken
         * 
         * @returns {Boolean} accepted
         */
        resetPassword: {
            params: {
                resetToken: { type: "string" },
                newPassword: { type: "string", min: 8 },
                totp: { type: "string", optional: true },
            },
            async handler (ctx) {
                const events = [];
                // validate/prepeare command
                const decoded = await this.encryption.verify({ token: ctx.params.resetToken });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                if (user.isMultiFactorAuthentificationActive()) {
                    if (!ctx.params.totp) throw new UnvalidMultiFactorAuthentificationToken({ token: ctx.params.totp });
                    const encrypted = user.getMultiFactorAuthentificationSecret();
                    if (!encrypted) throw new UserTOTPNotYetGenerated({ userId: user.state.uid });
                    const secret = await this.encryption.decryptData(encrypted);
                    const options = {
                        secret: secret.ascii,
                        window: 0,
                        token: ctx.params.totp
                    }
                    if (!TOTP.totp.verify(options)) throw new UnvalidMultiFactorAuthentificationToken({ token: ctx.params.totp });
                }
                const hashedNewPassword = this.encryption.getHash(ctx.params.newPassword);
                // apply command
                events.push(user.apply(new UserPasswordChanged({ userId: user.state.uid, passwordHash: hashedNewPassword })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * set alias for group
         * 
         * @command
         * @param {Uuid} groupId 
         * @param {String} alias
         * 
         * @emits GroupAliasSet
         * 
         * @throws UnvalidToken
         * 
         * @returns {Boolean} accepted
         */
        setGroupAlias: {
            params: {
                groupId: { type: "uuid" },
                alias: { type: "string", optional: true  }
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                // apply command
                events.push(user.apply(new GroupAliasSet({ 
                    userId: user.state.uid, 
                    groupId: ctx.params.groupId,
                    alias: ctx.params.alias
                })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * hide/unhide group
         * 
         * @command
         * @param {Uuid} groupId 
         * @param {Boolean} hide
         * 
         * @emits GroupHiddenFlagToggled
         * 
         * @throws UnvalidToken
         * 
         * @returns {Boolean} accepted
         */
        hideGroup: {
            params: {
                groupId: { type: "uuid" },
                hide: { type: "boolean" }
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                // apply command
                events.push(user.apply(new GroupHiddenFlagToggled({ 
                    userId: user.state.uid, 
                    groupId: ctx.params.groupId,
                    hide: ctx.params.hide
                })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * request user deletion
         * 
         * @command
         * 
         * @emits UserDeletionRequested
         * 
         * @throws UnvalidToken
         * @throws UserIsGroupMember
         * 
         * @returns {Boolean} accepted
         */
        requestDeletion: {
            async handler(ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                const state = user.getCurrentState();
                if (Object.keys(state.groups).length) throw new UserIsGroupMember({ userId: user.getId(), groups: Object.keys(state.groups) });
                if (user.isDeletionInProgress()) throw new UnvalidRequest({ userId: user.getId(), command: "requestDeletion" });
                // apply command
                events.push(user.apply(new UserDeletionRequested({ 
                    userId: user.getId()
                })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        /**
         * cancel user deletion request
         * 
         * @command
         * 
         * @emits UserDeletionCanceled
         * 
         * @throws UnvalidToken
         * @throws UnvalidRequest
         * 
         * @returns {Boolean} accepted
         */
        cancelDeletionRequest: {
            async handler (ctx) {
               const events = [];
               // validate command
               const { user } = await this.getUser(ctx);
               if (user.isDeletionInProgress()) throw new UnvalidRequest({ userId: user.getId(), command: "cancelDeletionRequest" });
               if (!user.isDeletionRequested()) throw new UnvalidRequest({ userId: user.getId(),  command: "cancelDeletionRequest" });
               events.push(user.apply(new UserDeletionCanceled({ 
                  userId: user.getId()
               })));
               // persist
               await user.commit();
               // return result
               return true;
            }
        },
   
        /**
         * Confirm deletion request
         * 
         * @command
         * 
         * @emits UserDeletionConfirmed
         * 
         * @throws UnvalidToken
         * @throws UnvalidRequest
         * 
         * @returns {Boolean} accepted
         */
        confirmDeletion: {
            async handler (ctx) {
                const events = [];
                // validate command
                const { user } = await this.getUser(ctx);
                if (!user.isDeletionRequested()) throw new UnvalidRequest({ userId: user.getId(), command: "confirmDeletion" });
                const deletionToken = await this.encryption.sign({ 
                    payload: { 
                        type: Constants.TOKEN_TYPE_USER_DELETION, 
                        userId: user.getId(), 
                        confirmedAt: new Date().getTime()
                    }, options: {}
                });
                events.push(user.apply(new UserDeletionConfirmed({ 
                    userId: user.getId(),
                    deletionToken: deletionToken.token
                })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },         

        /**
         * Delete user
         * 
         * @command
         * @param {String} deletionToken
         * 
         * @emits UserDeleted
         * 
         * @throws UnvalidToken
         * @throws UnvalidRequest
         * 
         * @returns {Boolean} accepted
         */
        delete: {
            params: {
                deletionToken: { type: "string"}
            },
            async handler (ctx) {
                const events = [];
                // validate command
                const decoded = await this.encryption.verify({ token: ctx.params.deletionToken });
                if (decoded.payload?.type !== Constants.TOKEN_TYPE_USER_DELETION) throw new UnvalidRequest({ deletionToken: ctx.params.deletionToken, command: "delete" });
                if (!decoded.payload?.userId) throw new UnvalidRequest({ deletionToken: ctx.params.deletionToken, command: "delete" });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                if (!user.isDeletionConfirmed()) throw new UnvalidRequest({ userId: user.getId(), command: "delete" });
                events.push(user.apply(new UserDeleted({ 
                    userId: user.getId(),
                    deletionToken: ctx.params.deletionToken
                })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },         

        // ********** Queries ************

        /**
         * Get user
         * 
         * @query
         * 
         * @returns {Object} user
         */
        get: {
            async handler(ctx) {
                const { user } = await this.getUser(ctx);
                return user.getCurrentState();
            }
        },

        /**
         * Verify authentification token & add user token
         * 
         * Called by gateway
         * 
         * @query
         * 
         * @returns {String} userToken
         */
        verifyAuthToken: {
            visibility: "public",
            async handler(ctx) {
                const { user, decoded } = await this.getUser(ctx);
                const { token: userTokenSigned } = await this.encryption.sign({ payload: { 
                    type: Constants.TOKEN_TYPE_USER, 
                    userId: user.state.uid, 
                    sessionId: decoded.payload.sessionId,
                    user: user.getTokenData()
                }});
                ctx.meta.userToken = userTokenSigned;
                return userTokenSigned;
            }
        },

        /**
         * Retrieve the generated TOTP secret
         * 
         * @query
         * 
         * @throws MultiFactorAuthentificationAlreadyActive
         * 
         * @returns {Object} totp secret
         */
        getGeneratedTOTP: {
            async handler (ctx) {
                const { user } = await this.getUser(ctx);
                if (user.isMultiFactorAuthentificationActive()) throw new MultiFactorAuthentificationAlreadyActive({ userId: user.state.uid });
                const encrypted = user.getMultiFactorAuthentificationSecret();
                const secret = this.encryption.decryptData(encrypted);
                return secret;
            }
        }, 

        /**
        * Get event log 
        * 
        * @query
        * @param {Date} from 
        * @param {Date} to 
        * 
        * @returns {Object} log data
        */
        getLog: {
            params: {
                from: { type: "date", convert: true, optional: true },
                to: { type: "date", convert: true, optional: true }
            },
            async handler (ctx) {
                // validate query
                const { user } = await this.getUser(ctx);
                // get log
                const log = await this.userRepository.getLog({ uid: user.uid, from: ctx.params.from, to: ctx.params.to });
                // return result
                return log;
            }
        }

    },
     
    /**
     * Events
     */
    events: {
        UserInvited: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                label: { type: "string" },
                invitationToken: { type: "string" },
                email: { type: "email" },
                invitedBy: { type: "object" },
                invitedAt: { type: "number" }
            },
            async handler(ctx) {
                const userId = await this.userRepository.preserveUniqueKey({ key: ctx.params.email, uid: uuid() })
                const user = await this.userRepository.getById({ uid: userId });
                // apply command
                user.apply(new UserInvited({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        UserUninvited: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                email: { type: "email" },
                uninvitedBy: { type: "object" },
                uninvitedAt: { type: "number" }
            },
            async handler(ctx) {
                const userId = await this.userRepository.preserveUniqueKey({ key: ctx.params.email, uid: uuid() });
                const user = await this.userRepository.getById({ uid: userId });
                // apply command
                user.apply(new UserUninvited({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberJoined: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                label: { type: "string" },
                member: { type: "object" },
                role: { type: "string" },
                joinedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.uid });
                // apply command
                user.apply(new GroupMemberJoined({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberLeft: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                member: { type: "object" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.uid });
                // apply command
                user.apply(new GroupMemberLeft({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberRemoved: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                userId: { type: "uuid" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.userId });
                // apply command
                user.apply(new GroupMemberRemoved({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupInvitationRefused: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                email: { type: "email" },
                refusedAt: { type: "number" }
            },
            async handler(ctx) {
                const userId = await this.userRepository.preserveUniqueKey({ key: ctx.params.email, uid: uuid() });
                const user = await this.userRepository.getById({ uid: userId });
                // apply command
                user.apply(new GroupInvitationRefused({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberNominatedForAdmin: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                member: { type: "object" },
                newRole: { type: "string" },
                nominatedBy: { type: "object" },
                nominatedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.user?.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.user?.uid });
                // apply command
                user.apply(new GroupMemberNominatedForAdmin({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberNominationForAdminAccepted: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                userId: { type: "uuid" },
                acceptedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.userId });
                // apply command
                user.apply(new GroupMemberNominationForAdminAccepted({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberNominationForAdminDeclined: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                userId: { type: "uuid" },
                declinedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.userId });
                // apply command
                user.apply(new GroupMemberNominationForAdminDeclined({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupMemberNominationRemoved: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                member: { type: "object" },
                removedBy: { type: "object" },
                removedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.user?.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.user?.uid });
                // apply command
                user.apply(new GroupMemberNominationRemoved({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupAdminRevokationRequested: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                member: { type: "object" },
                newRole: { type: "string" },
                requestedBy: { type: "object" },
                requestedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.user?.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.user?.uid });
                // apply command
                user.apply(new GroupAdminRevokationRequested({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupAdminRevokationAccepted: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                userId: { type: "uuid" },
                acceptedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.userId });
                // apply command
                user.apply(new GroupAdminRevokationAccepted({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupAdminRevokationDeclined: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                userId: { type: "uuid" },
                declinedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.userId });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.userId });
                // apply command
                user.apply(new GroupAdminRevokationDeclined({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupAdminRevokationRemoved: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                member: { type: "object" },
                removedBy: { type: "object" },
                removedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.user?.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.user?.uid });
                // apply command
                user.apply(new GroupAdminRevokationRemoved({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupDeletionRequested: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                requestedBy: { type: "object" },
                requestedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.requestedBy.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.requestedBy.uid });
                // apply command
                user.apply(new GroupDeletionRequested({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupDeletionCanceled: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                canceledBy: { type: "object" },
                canceledAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.canceledBy.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.canceledBy.uid });
                // apply command
                user.apply(new GroupDeletionCanceled({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        },
        GroupDeleted: {
            group: "users",
            params: {
                groupId: { type: "uuid" },
                lastAdmin: { type: "object" },
                deletionToken: { type: "string" },
                deletedAt: { type: "number" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.lastAdmin.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.lastAdmin.uid });
                // apply command
                user.apply(new GroupDeleted({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        }

    },
 
    /**
     * Methods
     */
    methods: {

        async getUser ({ meta }) {
            const decoded = await this.encryption.verify({ token: meta?.userToken || meta?.authToken });
            const user = await this.userRepository.getById({ uid: decoded.payload.userId });
            if (!user.isActiveSession(decoded.payload.sessionId))  throw new UnvalidToken({ token: meta?.authToken });
            return {
                user,
                decoded
            };
        }
    },

    /**
     * Service created lifecycle event handler
     */
    async created() {

        this.issuerTOTP = this.settings?.TOTP?.issuer || "imicros.de";

    },

    /**
     * Service started lifecycle event handler
     */
    async started () {

        if (!this.db) throw new Error("Database provider must be injected first");
        if (!this.encryption) throw new Error("Encryption provider must be injected first");

        this.userRepository = new UserRepository({ 
            db: this.db, 
            // -1: new snapshot after each event, 100: new snapshot after 100 events
            snapshotCounter: this.settings?.repository?.snapshotCounter || 100,
            publisher: this.publisher
        })
        await this.db.connect();

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        await this.db.disconnect();
    }
    
};
