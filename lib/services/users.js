/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { 
    UserCreated, 
    UserConfirmationRequested,
    UserConfirmed,
    UserPasswordChanged,
    UserLoggedIn,
    UserLoggedOut,
    UserMultiFactorRequested,
    UserInvited,
    GroupMemberJoined
} = require("../events/events");

const { 
    UserAlreadyExists,
    UserDoesNotExist,
    UserCreationFailed,
    UserNotYetConfirmed,
    WrongPassword,
    GroupAlreadyExists,
    GroupDoesNotExists,
    RequiresAdminRole,
    OnlyAllowedForMembers,
    UnvalidToken
} = require("../exceptions/exceptions");

const { UserRepository } = require("../repositories/repositories");
const { v4: uuid } = require("uuid");

module.exports = {
    name: "users",

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
 
        /**
         * Register a new user
         * 
         * @command
         * @param {Email} email
         * @param {String} password 
         * 
         * @emits UserCreated
         * 
         * @throws UserAlreadyExists
         * 
         * @returns {Object} result - exceptional case, where command returns data of the applied event! 
         */
        create: {
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
                events.push(user.apply(new UserCreated({ userId, email: ctx.params.email, passwordHash: hashedPassword, locale: ctx.params.locale })));
                // persist
                await user.commit();
                // return result
                return {
                    userId
                };
            }
        },

        /**
         * Login user
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
        logIn: {
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
                    const mfaToken = await this.encryption.sign({ payload: { type: "mfaToken", typeMFA, userId: user.state.uid, sessionId: ctx.params.sessionId }, options: {}});
                    // apply command
                    events.push(user.apply(new UserMultiFactorRequested({ userId: user.state.uid, mfaToken: mfaToken.token, typeMFA, locale: user.state.locale })));
                    authObject = {
                        mfaToken,
                        typeMFA, 
                        locale: user.state.locale
                    }
                } else {
                    const authToken = await this.encryption.sign({ payload: { type: "authToken", userId: user.state.uid, sessionId: ctx.params.sessionId }, options: {}});
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
                const decoded = await this.encryption.verify({ token: ctx.meta?.authToken });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                if (!user.isActiveSession(decoded.payload.sessionId))  throw new UnvalidToken({ token: ctx.meta?.authToken });
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
                const decoded = await this.encryption.verify({ token: ctx.meta?.authToken });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                if (!user.isActiveSession(decoded.payload.sessionId))  throw new UnvalidToken({ token: ctx.meta?.authToken });
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
                password: { type: "string", min: 8 }
            },
            async handler(ctx) {
                const events = [];
                // validate/prepeare command
                const decoded = await this.encryption.verify({ token: ctx.meta?.authToken });
                const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                if (!user.isActiveSession(decoded.payload.sessionId))  throw new UnvalidToken({ token: ctx.meta?.authToken });
                if (!user.isConfirmed()) throw new UserNotYetConfirmed({ userId: user.state.uid });
                const hashedPassword = this.encryption.getHash(ctx.params.password);
                // apply command
                events.push(user.apply(new UserPasswordChanged({ userId: user.state.uid, passwordHash: hashedPassword })));
                // persist
                await user.commit();
                // return result
                return true;
            }
        },

        // TODO
        logInMFA: {
            params: {
                mfaToken: { type: "string" },
                sessionId: { type: "uuid" }
            },
            async handler(ctx) {

            }
        },

        // TODO
        generateTOTP: {
            async handler(ctx) {

            }
        },

        // TODO 
        // activateTOTP
        // requestPasswordReset
        // resetPassword
        // requestDeletion
        // delete

        /**
         * Get user
         * 
         * @query
         * 
         * @returns {Object} user
         */
        get: {
            async handler(ctx) {
                const decoded = await this.encryption.verify({ token: ctx.meta?.authToken });
                if (decoded?.payload?.userId) {
                    const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                    return user.getCurrentState();
                }
                throw new UnvalidToken({ token: authToken });
            }
        },

        /**
         * Verify authentification token & add user token
         * 
         * @query
         * 
         * @returns {String} userToken
         */
         verifyAuthToken: {
            visibility: "public",
            async handler(ctx) {
                const decoded = await this.encryption.verify({ token: ctx.meta?.authToken });
                if (decoded?.payload?.userId) {
                    const user = await this.userRepository.getById({ uid: decoded.payload.userId });
                    const userTokenSigned = await this.encryption.sign({ payload: { 
                        type: "userToken", 
                        userId: user.state.uid, 
                        sessionId: decoded.payload.sessionId,
                        user: user.getTokenData()
                    }});
                    ctx.meta.userToken = userTokenSigned.token;
                    return userTokenSigned.token;
                }
                return false;
            }
        }
 
    },
     
    /**
     * Events
     */
    events: {
        UserInvited: {
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
        GroupMemberJoined: {
            params: {
                groupId: { type: "uuid" },
                label: { type: "string" },
                member: { type: "object" },
                role: { type: "string" }
            },
            async handler(ctx) {
                const user = await this.userRepository.getById({ uid: ctx.params.member.uid });
                if (!user.isPersistant()) throw new UserDoesNotExist({ uid: ctx.params.member.uid });
                // apply command
                user.apply(new GroupMemberJoined({ ...ctx.params })); 
                // persist
                await user.commit({ emit: false });
            }
        }
    },
 
    /**
     * Methods
     */
    methods: {
    },

    /**
     * Service created lifecycle event handler
     */
    async created() {
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
