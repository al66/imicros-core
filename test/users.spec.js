"use strict";

const { ServiceBroker } = require("moleculer");
const { Users } = require("../index");
const { Groups } = require("../index");
const { Agents } = require("../index");
const { Serializer } = require("../lib/provider/serializer");
const { Publisher } = require("../lib/provider/publisher");
const { Keys } = require("../lib/provider/keys");
const { Encryption } = require("../lib/provider/encryption");
const { Vault } = require("../lib/provider/vault");
const { Constants } = require("../lib/util/constants");

// helper & mocks
const { VaultMock } = require("./helper/vault");
const { Collect, events, initEvents } = require("./helper/collect");
const { users, groups, agents } = require("./helper/shared");
const { MemoryDB, CassandraDB } = require("./helper/db");

const { v4: uuid } = require("uuid");
const jwt = require("jsonwebtoken");
const TOTP = require("../lib/mfa/TOTP");
const fs = require("fs");
const { pipeline } = require('node:stream/promises');

describe.each([
    /*{ database: MemoryDB, name: "MemoryDB" },*/
    { database: CassandraDB, name: "CassandraDB" }
])("Test user service with database $name", ({ database }) => {

    let broker, authTokens = [], userTokens = [], secretsMFA = [], agentCredentials = [], agentAuthTokens = [], accessTokenUsers =[] , accessTokenAgents =[], internalAccessTokenUsers = [], internalAccessTokenAgents = [], authTokenUsers = [], authTokenAgents = [], userToken = [], agentToken = [], accessTokenInternalUsers = [], accessTokenInternalAgents = [];
    
    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    beforeEach(() => {
        initEvents();
    });

    describe("Test create service", () => {

        it("should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info"//"info" //"debug"
            });
            broker.createService({
                // sequence of providers is important: 
                // Keys and Serializer must be first, as they are used by Encryption
                // Database again depends on Encryption
                mixins: [Users, database, Publisher, Encryption, Serializer, Keys, Vault], 
                dependencies: ["v1.vault"],
                settings: {
                    keys: {
                        db: {
                            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                            keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
                            keysTable: "authkeys"
                        }
                    },
                    repository:{
                        snapshotCounter: 2  // new snapshot after 2 new events
                    },
                    vault: {
                        service: "v1.vault"
                    }
                }
            });
            broker.createService({
                mixins: [Groups, database, Publisher, Encryption, Serializer, Keys, Vault], 
                dependencies: ["v1.vault"],
                settings: {
                    keys: {
                        db: {
                            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                            keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
                            keysTable: "authkeys"
                        }
                    },
                    vault: {
                        service: "v1.vault"
                    }
                }
            })
            broker.createService({
                mixins: [Agents, database, Publisher, Encryption, Serializer, Keys, Vault], 
                dependencies: ["v1.vault"],
                settings: {
                    keys: {
                        db: {
                            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                            keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
                            keysTable: "authkeys"
                        }
                    },
                    vault: {
                        service: "v1.vault"
                    }
                }
            })
            broker.createService(Collect);
            broker.createService(VaultMock);
            await broker.start();
            //await broker.waitForServices(["users","groups","agents"]);
            expect(broker).toBeDefined()
        }, 30000);

    });

    describe("Test users create and confirm", () => {   
        let opts, authToken, sessionId, confirmationToken;

        beforeAll(async () => {
            await broker.waitForServices(["users"]);
        })

        beforeEach(() => {
            opts = {};
        });
        
        it("should create a new user", async () => {
            let params = {
                userId: users[0].uid,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.registerPWA", params, opts)
            expect(result.userId).toBeDefined();
            expect(result.userId).toEqual(users[0].uid);
            expect(events["UserWithPWARegistered"]).toBeDefined();
            expect(events["UserWithPWARegistered"].length).toEqual(1);
            expect(events["UserWithPWARegistered"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserWithPWARegistered"][0].payload.email).toEqual(users[0].email);
            expect(events["UserWithPWARegistered"][0].payload.locale).toEqual(users[0].locale);
            expect(events["UserWithPWARegistered"][0].payload.createdAt).toEqual(expect.any(Number));
        });

        it("should fail to create the user a second time", async () => {
            let params = {
                userId: users[0].uid,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            expect.assertions(2);
            try {
                await broker.call("users.registerPWA", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UserAlreadyExists");
                expect(err.email).toEqual(users[0].email);
            }
        });

        it("should fail to create an existing user again", async () => {
            let params = {
                userId: uuid(),
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            expect.assertions(2);
            try {
                await broker.call("users.registerPWA", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UserAlreadyExists");
                expect(err.email).toEqual(users[0].email);
            }
        });

        it("should login the user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authToken = result.authToken;
            authTokens[0] = result.authToken;
        });

        it("should request user confirmation", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.requestConfirmation", params, opts)
            expect(result).toEqual(true);
            expect(events["UserConfirmationRequested"]).toBeDefined();
            expect(events["UserConfirmationRequested"].length).toEqual(1);
            expect(events["UserConfirmationRequested"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserConfirmationRequested"][0].payload.confirmationToken).toEqual(expect.any(String));
            expect(events["UserConfirmationRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
            confirmationToken = events["UserConfirmationRequested"][0].payload.confirmationToken;
        })

        it("should confirm user", async () => {
            let params = {
                confirmationToken
            };
            const result = await  broker.call("users.confirm", params, opts)
            expect(result).toEqual(true);
            expect(events["UserConfirmed"]).toBeDefined();
            expect(events["UserConfirmed"].length).toEqual(1);
            expect(events["UserConfirmed"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserConfirmed"][0].payload.confirmedAt).toEqual(expect.any(Number));
        })

        it("should create a second user", async () => {
            let params = {
                userId: users[1].uid,
                email: users[1].email,
                password: users[1].password,
                locale: users[1].locale
            };
            const result = await  broker.call("users.registerPWA", params, opts)
            expect(result).toBeDefined();
            expect(result.userId).toBeDefined();
            expect(result.userId).toEqual(users[1].uid);
        });

        it("should login second user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[1].email,
                password: users[1].password,
                locale: users[1].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[1].locale
            })
            authToken = result.authToken;
        });

        it("should request user confirmation for second user", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.requestConfirmation", params, opts)
            expect(result).toEqual(true);
            expect(events["UserConfirmationRequested"]).toBeDefined();
            expect(events["UserConfirmationRequested"].length).toEqual(1);
            expect(events["UserConfirmationRequested"][0].payload.userId).toEqual(users[1].uid);
            expect(events["UserConfirmationRequested"][0].payload.confirmationToken).toEqual(expect.any(String));
            expect(events["UserConfirmationRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
            confirmationToken = events["UserConfirmationRequested"][0].payload.confirmationToken;
        })

        it("should confirm second user", async () => {
            let params = {
                confirmationToken
            };
            const result = await  broker.call("users.confirm", params, opts)
            expect(result).toEqual(true);
            expect(events["UserConfirmed"]).toBeDefined();
            expect(events["UserConfirmed"].length).toEqual(1);
            expect(events["UserConfirmed"][0].payload.userId).toEqual(users[1].uid);
            expect(events["UserConfirmed"][0].payload.confirmedAt).toEqual(expect.any(Number));
        })

        it("should generate TOTP", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.generateTOTP", params, opts);
            expect(result).toEqual(true);
            expect(events["UserTOTPGenerated"]).toBeDefined();
            expect(events["UserTOTPGenerated"].length).toEqual(1);
            expect(events["UserTOTPGenerated"][0].payload.userId).toEqual(users[1].uid);
            expect(events["UserTOTPGenerated"][0].payload.secret).toEqual(expect.any(String));
        })

        it("should retrieve generated TOTP", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.getGeneratedTOTP", params, opts);
            expect(result).toBeDefined();
            secretsMFA[1] = result;
            // console.log(result);
        })

        it("should activate TOTP", async () => {
            opts = { meta: { authToken } };
            const totp = TOTP.totp({
                secret: secretsMFA[1].ascii
            })
            // console.log(totp);
            let params = {
                totp
            };
            const result = await  broker.call("users.activateTOTP", params, opts);
            expect(result).toEqual(true);
        })
        
        it("should log out second user", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
            expect(events["UserLoggedOut"]).toBeDefined();
            expect(events["UserLoggedOut"].length).toEqual(1);
            expect(events["UserLoggedOut"][0].payload.userId).toEqual(users[1].uid);
            expect(events["UserLoggedOut"][0].payload.sessionId).toEqual(sessionId);
            expect(events["UserLoggedOut"][0].payload.authToken).toEqual(authToken);
            expect(events["UserLoggedOut"][0].payload.loggedOutAt).toEqual(expect.any(Number));
        })

        it("should create third user", async () => {
            let params = {
                userId: users[3].uid,
                email: users[3].email,
                password: users[3].password,
                locale: users[3].locale
            };
            const result = await  broker.call("users.registerPWA", params, opts)
            expect(result.userId).toBeDefined();
            expect(result.userId).toEqual(users[3].uid);
        });

        it("should login third user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[3].email,
                password: users[3].password
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[3].locale
            })
            authToken = result.authToken;
        });

        it("should request user confirmation for third user", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.requestConfirmation", params, opts)
            expect(result).toEqual(true);
            confirmationToken = events["UserConfirmationRequested"][0].payload.confirmationToken;
        })

        it("should confirm third user", async () => {
            let params = {
                confirmationToken
            };
            const result = await  broker.call("users.confirm", params, opts)
            expect(result).toEqual(true);
        })        

        it("should log out third user", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
        })

        it("should login third user and retrieve authToken with confirmed status", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[3].email,
                password: users[3].password
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[3].locale
            })
            authTokens[3] = result.authToken;
        });

        it("should verify the authToken and return userToken for third user", async () => {
            opts = { meta: { authToken: authTokens[3] } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual("userToken");
            expect(decoded.userId).toEqual(users[3].uid);
            expect(decoded.sessionId).toEqual(sessionId);
            expect(decoded.user).toEqual({
                uid: users[3].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[3].email,
                locale: users[3].locale
            });
            userTokens[3] = result;
        });

    });

    describe("Test verify authToken", () => {
        let opts, sessionId, mfaToken;

        beforeAll(async () => {
            await broker.waitForServices(["users"]);
        })

        it("should login first user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authTokens[0] = result.authToken;
        });

        it("should verify the authToken and return userToken for first user", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual("userToken");
            expect(decoded.userId).toEqual(users[0].uid);
            expect(decoded.sessionId).toEqual(sessionId);
            expect(decoded.user).toEqual({
                uid: users[0].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[0].email,
                locale: users[0].locale
            });
            userTokens[0] = result;
        });
        
        it("should respond with MFA token on login second user ", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[1].email,
                password: users[1].password,
                locale: users[1].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                mfaToken: expect.any(String),
                typeMFA: "TOTP",
                locale: users[1].locale
            })
            mfaToken = result.mfaToken;
        });

        it("should login second user ", async () => {
            const totp = TOTP.totp({
                secret: secretsMFA[1].ascii
            })
            let params = {
                mfaToken,
                totp
            };
            const result = await  broker.call("users.logInTOTP", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[1].locale
            })
            authTokens[1] = result.authToken;
        });

        it("should verify the authToken and return userToken for second user", async () => {
            opts = { meta: { authToken: authTokens[1] } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual("userToken");
            expect(decoded.userId).toEqual(users[1].uid);
            expect(decoded.sessionId).toEqual(sessionId);
            expect(decoded.user).toEqual({
                uid: users[1].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[1].email,
                locale: users[1].locale
            });
            userTokens[1] = result;
        });
    });

    describe("Test change password", () => {
        let opts, sessionId, resetToken, mfaToken;

        beforeAll(async () => {
            await broker.waitForServices(["users"]);
        })

        it("should login the user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authTokens[0] = result.authToken;
        });

        it("should change user password", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            const oldPassword = users[0].password;
            users[0].password = "?My:changed:secret!"
            let params = {
                oldPassword,
                newPassword: users[0].password
            };
            const result = await  broker.call("users.changePassword", params, opts)
            expect(result).toEqual(true);
            expect(events["UserPasswordChanged"]).toBeDefined();
            expect(events["UserPasswordChanged"].length).toEqual(1);
            expect(events["UserPasswordChanged"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserPasswordChanged"][0].payload.passwordHash).toEqual(expect.any(String));
            expect(events["UserPasswordChanged"][0].payload.passwordHash).not.toEqual(users[0].password);
            expect(events["UserPasswordChanged"][0].payload.changedAt).toEqual(expect.any(Number));
        })

        it("should log out an user", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
            expect(events["UserLoggedOut"]).toBeDefined();
            expect(events["UserLoggedOut"].length).toEqual(1);
            expect(events["UserLoggedOut"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserLoggedOut"][0].payload.sessionId).toEqual(sessionId);
            expect(events["UserLoggedOut"][0].payload.authToken).toEqual(authTokens[0]);
            expect(events["UserLoggedOut"][0].payload.loggedOutAt).toEqual(expect.any(Number));
        })

        it("should fail changing user password with logged out session", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {
                oldPassword: users[0].password,
                newPassword: "?My:updated:secret!"
            };
            expect.assertions(2);
            try {
                await broker.call("users.changePassword", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UnvalidToken");
                expect(err.token).toEqual(authTokens[0]);
            }
        })

        it("should log in with changed password", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authTokens[0] = result.authToken;
        });

        it("should log out the user", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
        })

        it("should request a password reset", async () => {
            opts = { };
            let params = { 
                email: users[0].email
            };
            const result = await  broker.call("users.requestPasswordReset", params, opts)
            expect(result).toEqual(true);
            expect(events["UserPasswordResetRequested"]).toBeDefined();
            expect(events["UserPasswordResetRequested"].length).toEqual(1);
            expect(events["UserPasswordResetRequested"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserPasswordResetRequested"][0].payload.email).toEqual(users[0].email);
            expect(events["UserPasswordResetRequested"][0].payload.locale).toEqual(users[0].locale);
            expect(events["UserPasswordResetRequested"][0].payload.resetToken).toEqual(expect.any(String));
            expect(events["UserPasswordResetRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
            resetToken = events["UserPasswordResetRequested"][0].payload.resetToken;
        })

        it("should reset user password", async () => {
            opts = { };
            users[0].password = "?My:changed:secret!"
            let params = {
                resetToken,
                newPassword: users[0].password
            };
            const result = await  broker.call("users.resetPassword", params, opts)
            expect(result).toEqual(true);
            expect(events["UserPasswordChanged"]).toBeDefined();
            expect(events["UserPasswordChanged"].length).toEqual(1);
            expect(events["UserPasswordChanged"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserPasswordChanged"][0].payload.passwordHash).toEqual(expect.any(String));
            expect(events["UserPasswordChanged"][0].payload.passwordHash).not.toEqual(users[0].password);
            expect(events["UserPasswordChanged"][0].payload.changedAt).toEqual(expect.any(Number));
        })

        it("should log in with reset password", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authTokens[0] = result.authToken;
        });

        it("should fail to request password reset w/o MFA token", async () => {
            let params = {
                email: users[1].email,
            };
            expect.assertions(2);
            try {
                await broker.call("users.requestPasswordReset", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UnvalidMultiFactorAuthentificationToken");
                expect(err.token).toEqual(undefined);
            }
        });

        it("should request a password reset with MFA", async () => {
            opts = { };
            const totp = TOTP.totp({
                secret: secretsMFA[1].ascii
            })
            let params = { 
                email: users[1].email,
                totp
            };
            const result = await  broker.call("users.requestPasswordReset", params, opts)
            expect(result).toEqual(true);
            expect(events["UserPasswordResetRequested"]).toBeDefined();
            expect(events["UserPasswordResetRequested"].length).toEqual(1);
            expect(events["UserPasswordResetRequested"][0].payload.userId).toEqual(users[1].uid);
            expect(events["UserPasswordResetRequested"][0].payload.email).toEqual(users[1].email);
            expect(events["UserPasswordResetRequested"][0].payload.locale).toEqual(users[1].locale);
            expect(events["UserPasswordResetRequested"][0].payload.resetToken).toEqual(expect.any(String));
            expect(events["UserPasswordResetRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
            resetToken = events["UserPasswordResetRequested"][0].payload.resetToken;
        })

        it("should fail to reset password w/o MFA token", async () => {
            let params = {
                resetToken,
                newPassword: users[1].password
            };
            expect.assertions(2);
            try {
                await broker.call("users.resetPassword", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UnvalidMultiFactorAuthentificationToken");
                expect(err.token).toEqual(undefined);
            }
        });

        it("should reset user password with MFA", async () => {
            opts = { };
            const totp = TOTP.totp({
                secret: secretsMFA[1].ascii
            })
            users[1].password = "?My:changed:secret!"
            let params = {
                resetToken,
                newPassword: users[1].password,
                totp
            };
            const result = await  broker.call("users.resetPassword", params, opts)
            expect(result).toEqual(true);
            expect(events["UserPasswordChanged"]).toBeDefined();
            expect(events["UserPasswordChanged"].length).toEqual(1);
            expect(events["UserPasswordChanged"][0].payload.userId).toEqual(users[1].uid);
            expect(events["UserPasswordChanged"][0].payload.passwordHash).toEqual(expect.any(String));
            expect(events["UserPasswordChanged"][0].payload.passwordHash).not.toEqual(users[1].password);
            expect(events["UserPasswordChanged"][0].payload.changedAt).toEqual(expect.any(Number));
        })

        it("should respond with MFA token on login second user ", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[1].email,
                password: users[1].password,
                locale: users[1].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                mfaToken: expect.any(String),
                typeMFA: "TOTP",
                locale: users[1].locale
            })
            mfaToken = result.mfaToken;
        });

        it("should login second user ", async () => {
            const totp = TOTP.totp({
                secret: secretsMFA[1].ascii
            })
            let params = {
                mfaToken,
                totp
            };
            const result = await  broker.call("users.logInTOTP", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[1].locale
            })
            authTokens[1] = result.authToken;
        });

    });

    describe("Test groups create & invite, uninvite and join members", () => {   

        let opts, sessionId, confirmationToken, invitationToken;

        beforeAll(async () => {
            await broker.waitForServices(["users","groups"]);
        })

        beforeEach(() => {
            opts = { 
                meta: {
                    userToken: userTokens[0]
                }
            };
        });
        
        it("should create a new group", async () => {
            let params = {
                groupId: groups[0].uid,
                label: groups[0].label,
            }
            const result = await  broker.call("groups.create", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupCreated"]).toBeDefined();
            expect(events["GroupCreated"].length).toEqual(1);
            expect(events["GroupCreated"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupCreated"][0].payload.label).toEqual(groups[0].label);
            expect(events["GroupCreated"][0].payload.createdAt).toEqual(expect.any(Number));            
            expect(events["GroupMemberJoined"]).toBeDefined();
            expect(events["GroupMemberJoined"].length).toEqual(1);
            expect(events["GroupMemberJoined"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberJoined"][0].payload.label).toEqual(groups[0].label);
            expect(events["GroupMemberJoined"][0].payload.member).toEqual({
                uid: users[0].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[0].email,
                locale: users[0].locale        
            });
            expect(events["GroupMemberJoined"][0].payload.role).toEqual("admin");
            expect(events["GroupMemberJoined"][0].payload.joinedAt).toEqual(expect.any(Number));            
        });

        it("should fail to create the same group again", async () => {
            let params = {
                groupId: groups[0].uid,
                label: groups[0].label,
            }
            expect.assertions(2);
            try {
                await broker.call("groups.create", params, opts);
            } catch (err) {
                expect(err.message).toEqual("GroupAlreadyExists");
                expect(err.uid).toEqual(groups[0].uid);
            }
        });

        it("should retrieve the created group", async () => {
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result).toEqual({
                uid: groups[0].uid,
                createdAt: expect.any(Number),
                label: groups[0].label,
                adminGroup: false,
                members: [{ 
                    user: {
                        uid: users[0].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[0].email,
                        locale: users[0].locale
                    }, 
                    role: "admin"
                }],
                keys: expect.any(Object)
            });
        });

        it("should fail to retrieve the group by a non-member", async () => {
            opts.meta.userToken = userTokens[1];
            let params = {
                groupId: groups[0].uid
            }
            expect.assertions(2);
            try {
                await broker.call("groups.get", params, opts);
            } catch (err) {
                expect(err.message).toEqual("OnlyAllowedForMembers");
                expect(err.groupId).toEqual(groups[0].uid);
            }
        });

        it("should list the group for creating user with admin role", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.groups[groups[0].uid]).toEqual(
                expect.objectContaining({
                    groupId: groups[0].uid,
                    label: groups[0].label,
                    role: "admin"
                })
            )
        });

        it("should rename the group", async () => {
            groups[0].label = "my renamed group"
            let params = {
                groupId: groups[0].uid,
                label: groups[0].label
            }
            const result = await broker.call("groups.rename", params, opts);
            expect(result).toEqual(true);
            expect(events["GroupRenamed"]).toBeDefined();
            expect(events["GroupRenamed"].length).toEqual(1);
            expect(events["GroupRenamed"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupRenamed"][0].payload.label).toEqual(groups[0].label);
            expect(events["GroupRenamed"][0].payload.user).toEqual({
                uid: users[0].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[0].email,
                locale: users[0].locale
            });            
        });

        it("should fail to rename the group", async () => {
            opts.meta.userToken = userTokens[1];
            let params = {
                groupId: groups[0].uid,
                label: "any label"
            }
            expect.assertions(2);
            try {
                await broker.call("groups.rename", params, opts);
            } catch (err) {
                expect(err.message).toEqual("RequiresAdminRole");
                expect(err.groupId).toEqual(groups[0].uid);
            }
        });

        it("should invite a user", async () => {
            let params = {
                groupId: groups[0].uid,
                email: users[2].email
            }
            const result = await broker.call("groups.inviteUser", params, opts);
            expect(result).toEqual(true);
            expect(events["UserInvited"]).toBeDefined();
            expect(events["UserInvited"].length).toEqual(1);
            expect(events["UserInvited"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["UserInvited"][0].payload.label).toEqual(groups[0].label);
            expect(events["UserInvited"][0].payload.email).toEqual(users[2].email);
            expect(events["UserInvited"][0].payload.invitationToken).toEqual(expect.any(String));
            expect(events["UserInvited"][0].payload.invitedBy).toEqual({
                uid: users[0].uid,
                email: users[0].email
            });            
        });

        it("should create the invited user", async () => {
            let params = {
                userId: users[2].uid,
                email: users[2].email,
                password: users[2].password,
                locale: users[2].locale
            };
            const result = await  broker.call("users.registerPWA", params, opts)
            expect(result).toBeDefined();
            expect(result.userId).toBeDefined();
            users[2].uid = result.userId
        });

        it("should login the invited user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[2].email,
                password: users[2].password,
                locale: users[2].locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[2].locale
            })
            authTokens[2] = result.authToken;
        });

        it("should list the invitation for the invited user", async () => {
            opts = { meta: { authToken: authTokens[2] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.invitations[groups[0].uid]).toBeDefined();
            expect(result.invitations[groups[0].uid]).toEqual({
                label: groups[0].label,
                invitationToken: expect.any(String),
                invitedBy: users[0].email,
                invitedAt: expect.any(Number)
            })
            invitationToken = result.invitations[groups[0].uid].invitationToken;
        });

        it("should request user confirmation for second user", async () => {
            opts = { meta: { authToken: authTokens[2] } };
            let params = {};
            const result = await  broker.call("users.requestConfirmation", params, opts)
            expect(result).toEqual(true);
            expect(events["UserConfirmationRequested"]).toBeDefined();
            expect(events["UserConfirmationRequested"].length).toEqual(1);
            expect(events["UserConfirmationRequested"][0].payload.userId).toEqual(users[2].uid);
            expect(events["UserConfirmationRequested"][0].payload.confirmationToken).toEqual(expect.any(String));
            expect(events["UserConfirmationRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
            confirmationToken = events["UserConfirmationRequested"][0].payload.confirmationToken;
        })

        it("should confirm second user", async () => {
            let params = {
                confirmationToken
            };
            const result = await  broker.call("users.confirm", params, opts)
            expect(result).toEqual(true);
            expect(events["UserConfirmed"]).toBeDefined();
            expect(events["UserConfirmed"].length).toEqual(1);
            expect(events["UserConfirmed"][0].payload.userId).toEqual(users[2].uid);
            expect(events["UserConfirmed"][0].payload.confirmedAt).toEqual(expect.any(Number));
        })

        it("should verify the authToken and return userToken for second user", async () => {
            opts = { meta: { authToken: authTokens[2] } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual("userToken");
            expect(decoded.userId).toEqual(users[2].uid);
            expect(decoded.sessionId).toEqual(sessionId);
            expect(decoded.user).toEqual({
                uid: users[2].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[2].email,
                locale: users[2].locale
            });
            userTokens[2] = result;
        });

        it("should join the group", async () => {
            opts = { meta: { userToken: userTokens[2] } };
            let params = {
                invitationToken
            };
            const result = await  broker.call("groups.join", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupMemberJoined"]).toBeDefined();
            expect(events["GroupMemberJoined"].length).toEqual(1);
            expect(events["GroupMemberJoined"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberJoined"][0].payload.label).toEqual(groups[0].label);
            expect(events["GroupMemberJoined"][0].payload.member).toEqual({
                uid: users[2].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[2].email,
                locale: users[2].locale        
            });
            expect(events["GroupMemberJoined"][0].payload.role).toEqual("member");
            expect(events["GroupMemberJoined"][0].payload.joinedAt).toEqual(expect.any(Number));            
        })

        it("should invite an existing user", async () => {
            let params = {
                groupId: groups[0].uid,
                email: users[3].email
            }
            const result = await broker.call("groups.inviteUser", params, opts);
            expect(result).toEqual(true);
            expect(events["UserInvited"]).toBeDefined();
            expect(events["UserInvited"].length).toEqual(1);
            expect(events["UserInvited"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["UserInvited"][0].payload.label).toEqual(groups[0].label);
            expect(events["UserInvited"][0].payload.email).toEqual(users[3].email);
            expect(events["UserInvited"][0].payload.invitationToken).toEqual(expect.any(String));
            expect(events["UserInvited"][0].payload.invitedBy).toEqual({
                uid: users[0].uid,
                email: users[0].email
            });            
            invitationToken = events["UserInvited"][0].payload.invitationToken;
        })

        it("should list the invitation for the invited user", async () => {
            opts = { meta: { authToken: authTokens[3] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.invitations[groups[0].uid]).toBeDefined();
            expect(result.invitations[groups[0].uid]).toEqual({
                label: groups[0].label,
                invitationToken: expect.any(String),
                invitedBy: users[0].email,
                invitedAt: expect.any(Number)
            })
        });

        it("should refuse invitation", async () => {
            let params = {
                invitationToken
            }
            const result = await broker.call("groups.refuseInvitation", params, opts);
            expect(result).toEqual(true);
            expect(events["GroupInvitationRefused"]).toBeDefined();
            expect(events["GroupInvitationRefused"].length).toEqual(1);
            expect(events["GroupInvitationRefused"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupInvitationRefused"][0].payload.email).toEqual(users[3].email);
            expect(events["GroupInvitationRefused"][0].payload.refusedAt).toEqual(expect.any(Number));            

        })

        it("should not list the group for the uninvited user", async () => {
            opts = { meta: { authToken: authTokens[3] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.invitations[groups[0].uid]).not.toBeDefined();
        });

        it("should invite user who has refused again", async () => {
            let params = {
                groupId: groups[0].uid,
                email: users[3].email
            }
            const result = await broker.call("groups.inviteUser", params, opts);
            expect(result).toEqual(true);
            invitationToken = events["UserInvited"][0].payload.invitationToken;
        })

        it("should uninvite user again", async () => {
            let params = {
                groupId: groups[0].uid,
                email: users[3].email
            }
            const result = await broker.call("groups.uninviteUser", params, opts);
            expect(result).toEqual(true);
            expect(events["UserUninvited"]).toBeDefined();
            expect(events["UserUninvited"].length).toEqual(1);
            expect(events["UserUninvited"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["UserUninvited"][0].payload.email).toEqual(users[3].email);
            expect(events["UserUninvited"][0].payload.uninvitedBy).toEqual({
                uid: users[0].uid,
                email: users[0].email
            });            

        })

        it("should not list the group for the uninvited user", async () => {
            opts = { meta: { authToken: authTokens[3] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.invitations[groups[0].uid]).not.toBeDefined();
        });

        it("should invite uninvited user again", async () => {
            let params = {
                groupId: groups[0].uid,
                email: users[3].email
            }
            const result = await broker.call("groups.inviteUser", params, opts);
            expect(result).toEqual(true);
            invitationToken = events["UserInvited"][0].payload.invitationToken;
        })

        it("should join the group with the new invitation", async () => {
            opts = { meta: { userToken: userTokens[3] } };
            let params = {
                invitationToken
            };
            const result = await  broker.call("groups.join", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupMemberJoined"]).toBeDefined();
            expect(events["GroupMemberJoined"].length).toEqual(1);
            expect(events["GroupMemberJoined"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberJoined"][0].payload.label).toEqual(groups[0].label);
            expect(events["GroupMemberJoined"][0].payload.member).toEqual({
                uid: users[3].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[3].email,
                locale: users[3].locale        
            });
            expect(events["GroupMemberJoined"][0].payload.role).toEqual("member");
            expect(events["GroupMemberJoined"][0].payload.joinedAt).toEqual(expect.any(Number));            
        })

        it("should set alias for the group", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                alias: "My alias name"
            };
            const result = await  broker.call("users.setGroupAlias", params, opts)
            expect(result).toEqual(true);
        });

        it("should hide the group", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                hide: true
            };
            const result = await  broker.call("users.hideGroup", params, opts)
            expect(result).toEqual(true);
        });

        it("should list the group with alias and hidden flag", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.groups[groups[0].uid].hide).toEqual(true);
            expect(result.groups[groups[0].uid].alias).toEqual("My alias name");
        });


        it("should log out the first user", async () => {
            opts = { meta: { authToken: authTokens[0] } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
            expect(events["UserLoggedOut"]).toBeDefined();
            expect(events["UserLoggedOut"].length).toEqual(1);
            expect(events["UserLoggedOut"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserLoggedOut"][0].payload.sessionId).toEqual(expect.any(String));
            expect(events["UserLoggedOut"][0].payload.authToken).toEqual(authTokens[0]);
            expect(events["UserLoggedOut"][0].payload.loggedOutAt).toEqual(expect.any(Number));
        })

        it("should create a second group", async () => {
            opts = { meta: { userToken: userTokens[3] } };
            let params = {
                groupId: groups[1].uid,
                label: groups[1].label,
            }
            const result = await  broker.call("groups.create", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupCreated"]).toBeDefined();
            expect(events["GroupCreated"].length).toEqual(1);
            expect(events["GroupCreated"][0].payload.groupId).toEqual(groups[1].uid);
            expect(events["GroupCreated"][0].payload.label).toEqual(groups[1].label);
            expect(events["GroupCreated"][0].payload.createdAt).toEqual(expect.any(Number));            
            expect(events["GroupMemberJoined"]).toBeDefined();
            expect(events["GroupMemberJoined"].length).toEqual(1);
            expect(events["GroupMemberJoined"][0].payload.groupId).toEqual(groups[1].uid);
            expect(events["GroupMemberJoined"][0].payload.label).toEqual(groups[1].label);
            expect(events["GroupMemberJoined"][0].payload.member).toEqual({
                uid: users[3].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[3].email,
                locale: users[3].locale        
            });
            expect(events["GroupMemberJoined"][0].payload.role).toEqual("admin");
            expect(events["GroupMemberJoined"][0].payload.joinedAt).toEqual(expect.any(Number));            
        });


    });
   
    describe("Test groups access", () => {   

        let opts, accessToken, encrypted;

        beforeAll(async () => {
            await broker.waitForServices(["users","groups"]);
        })

        beforeEach(() => {
            opts = { 
                meta: {
                    userToken: userTokens[0]
                }
            };
        });
        
        it("retrieve access token", async () => {
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.requestAccessForMember", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                accessToken: expect.any(String),
            })
            accessToken = result.accessToken;
        });

        it("verify access token and retrieve internal access token", async () => {
            opts.meta.authToken = accessToken;
            let params = {};
            const result = await  broker.call("groups.verifyAccessToken", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(expect.any(String))
            const decoded = jwt.decode(result);
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_ACCESS_INTERNAL);
            expect(decoded.userId).toEqual(users[0].uid);
            expect(decoded.groupId).toEqual(groups[0].uid);
            expect(decoded.role).toEqual("admin");
            accessTokenInternalUsers[0] = result;
        });

        it("retrieve access token for member", async () => {
            opts.meta.userToken = userTokens[2];
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.requestAccessForMember", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                accessToken: expect.any(String),
            })
            accessToken = result.accessToken;
        });

        it("verify access token and retrieve internal access token for second user", async () => {
            opts.meta.userToken = userTokens[2];
            opts.meta.authToken = accessToken;
            let params = {};
            const result = await  broker.call("groups.verifyAccessToken", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(expect.any(String))
            const decoded = jwt.decode(result);
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_ACCESS_INTERNAL);
            expect(decoded.userId).toEqual(users[2].uid);
            expect(decoded.groupId).toEqual(groups[0].uid);
            expect(decoded.role).toEqual("member");
            accessTokenInternalUsers[2] = result;
        });

        it("should encrypt data with the group key", async () => {
            opts.meta.accessToken = accessToken;
            opts.meta.caller = "v1.store";
            const params = {
                data: {
                    "any": "object"
                }
            }
            const result = await  broker.call("groups.encrypt", params, opts)
            expect(result).toBeDefined();
            encrypted = result;
        });

        it("should decrypt data with the group key", async () => {
            opts.meta.accessToken = accessToken;
            opts.meta.caller = "v2.store";
            const params = {
                encrypted
            }
            const result = await  broker.call("groups.decrypt", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                "any": "object"
            });
        });

        it("should not decrypt data with the group key", async () => {
            opts.meta.accessToken = accessToken;
            opts.meta.caller = "v2.other";
            const params = {
                encrypted
            }
            expect.assertions(1);
            try {
                await broker.call("groups.decrypt", params, opts);
            } catch (err) {
                expect(err.message).toEqual("failed to decrypt");
            }
        });

        it("should rotate the default group key", async () => {
            let params = {
                groupId: groups[0].uid
            }
            await  broker.emit("GroupsDefaultKeyExpired", params, opts);
            opts = { meta: { userToken: userTokens[3] } };
            const result = await broker.call("groups.get", params, opts);
            expect(result).toBeDefined();
            expect(Object.keys(result.keys.store).length === 2).toBe(true);
        })

        it("should rotate the default group key again", async () => {
            let params = {
                groupId: groups[0].uid
            }
            await  broker.emit("GroupsDefaultKeyExpired", params, opts);
            opts = { meta: { userToken: userTokens[3] } };
            const result = await broker.call("groups.get", params, opts);
            expect(result).toBeDefined();
            expect(Object.keys(result.keys.store).length === 3).toBe(true);
        })

        it("it should encrypt and decrypt a stream", async () => {
            opts.meta.accessToken = accessToken;
            opts.meta.caller = "v2.store";
            let params = {};
            const filePath = "assets/favicon"
            let readStream = fs.createReadStream(`${filePath}.ico`);
            let writeStream = fs.createWriteStream(`${filePath}.stream.enc.ico`);
            const { cipher } = await  broker.call("groups.encryptStream", params, opts);
            const { decipher } = await  broker.call("groups.decryptStream", params, opts);
            expect(cipher).toBeDefined();
            expect(decipher).toBeDefined();
            await pipeline(readStream, cipher, writeStream);
            readStream = fs.createReadStream(`${filePath}.stream.enc.ico`);
            writeStream = fs.createWriteStream(`${filePath}.stream.dec.ico`);
            await pipeline(readStream, decipher, writeStream);
            const original = fs.readFileSync(`${filePath}.ico`);
            const decoded = fs.readFileSync(`${filePath}.stream.dec.ico`);
            expect(original.equals(decoded)).toEqual(true);
        });

    });
    
    describe("Test agents", () => {

        let opts, agentToken, accessToken, encrypted;

        beforeAll(async () => {
            await broker.waitForServices(["users","groups","agents"]);
        })

        beforeEach(() => {});

        it("retrieve access token", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.requestAccessForMember", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                accessToken: expect.any(String),
            })
            accessTokenUsers[0] = result.accessToken;
        });

        it("retrieve access token for second user", async () => {
            opts = { meta: { userToken: userTokens[2] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.requestAccessForMember", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                accessToken: expect.any(String),
            })
            accessTokenUsers[2] = result.accessToken;
        });

        it("should verify the accessToken and return userToken", async () => {
            opts = { meta: { authToken: accessTokenUsers[0], userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_USER);
            expect(decoded.userId).toEqual(users[0].uid);
            expect(decoded.sessionId).toEqual(expect.any(String));
            expect(decoded.user).toEqual({
                uid: users[0].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[0].email,
                locale: users[0].locale
            });
            userTokens[0] = result;
        });

        it("should verify the accessToken and return userToken for second user", async () => {
            opts = { meta: { authToken: accessTokenUsers[2], userToken: userTokens[2] } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_USER);
            expect(decoded.userId).toEqual(users[2].uid);
            expect(decoded.sessionId).toEqual(expect.any(String));
            expect(decoded.user).toEqual({
                uid: users[2].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[2].email,
                locale: users[2].locale
            });
            userTokens[2] = result;
        });

        it("should verify access token and return internal access token", async () => {
            opts = { meta: { authToken: accessTokenUsers[0], userToken: userTokens[0] } };
            const result = await  broker.call("groups.verifyAccessToken", {}, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(expect.any(String))
            const decoded = jwt.decode(result);
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_ACCESS_INTERNAL);
            expect(decoded.userId).toEqual(users[0].uid);
            expect(decoded.groupId).toEqual(groups[0].uid);
            expect(decoded.role).toEqual("admin");
            accessTokenInternalUsers[0] = result;
        });

        it("should verify access token and return internal access token for second user", async () => {
            opts = { meta: { authToken: accessTokenUsers[2], userToken: userTokens[2] } };
            const result = await  broker.call("groups.verifyAccessToken", {}, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(expect.any(String))
            const decoded = jwt.decode(result);
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_ACCESS_INTERNAL);
            expect(decoded.userId).toEqual(users[2].uid);
            expect(decoded.groupId).toEqual(groups[0].uid);
            expect(decoded.role).toEqual("member");
            accessTokenInternalUsers[2] = result;
        });


        it("should create an agent", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            let params = {
                agentId: agents[0].uid,
                label: agents[0].label
            };
            const result = await  broker.call("agents.create", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(true);
        })

        it("should fail to create an agent", async () => {
            opts.meta = { userToken: userTokens[2], accessToken: accessTokenInternalUsers[2] };
            let params = {
                agentId: uuid(),
                label: "my first agent"
            };
            expect.assertions(2);
            try {
                await broker.call("agents.create", params, opts);
            } catch (err) {
                expect(err.message).toEqual("RequiresAdminRole");
                expect(err.groupId).toEqual(groups[0].uid);
            }
        })

        it("should list the agents of the group", async () => {
            opts.meta = { userToken: userTokens[2], accessToken: accessTokenInternalUsers[2] };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result.uid).toEqual(groups[0].uid);
            expect(result.agents[agents[0].uid]).toEqual({
                uid: agents[0].uid,
                label: agents[0].label,
                createdAt: expect.any(Number)
            });

        })
   
        it("should rename an agent", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            agents[0].label = "my first agent (renamed)"
            let params = {
                agentId: agents[0].uid,
                label: agents[0].label
            };
            const result = await  broker.call("agents.rename", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["AgentRenamed"]).toBeDefined();
            expect(events["AgentRenamed"].length).toEqual(1);
            expect(events["AgentRenamed"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["AgentRenamed"][0].payload.agentId).toEqual(agents[0].uid);
            expect(events["AgentRenamed"][0].payload.label).toEqual(agents[0].label);
            expect(events["AgentRenamed"][0].payload.renamedAt).toEqual(expect.any(Number));            
        })

        it("should create credentials", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            agentCredentials[0] = {
                agentId: agents[0].uid,
                uid: uuid()
            };
            let params = {
                agentId: agents[0].uid,
                credentialsId: agentCredentials[0].uid
            };
            const result = await  broker.call("agents.createCredentials", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["CredentialsCreated"]).toBeDefined();
            expect(events["CredentialsCreated"].length).toEqual(1);
            expect(events["CredentialsCreated"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["CredentialsCreated"][0].payload.agentId).toEqual(agents[0].uid);
            expect(events["CredentialsCreated"][0].payload.credentialsId).toEqual(agentCredentials[0].uid);
            expect(events["CredentialsCreated"][0].payload.credentials).toEqual({
                uid: agentCredentials[0].uid,
                hashedSecret: expect.any(String),
                encryptedSecret: expect.any(String)
            });
            // console.log(events["CredentialsCreated"][0].payload.credentials)
            expect(events["CredentialsCreated"][0].payload.createdAt).toEqual(expect.any(Number));            
        })

        it("should retrieve the decrypted secret", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            let params = {
                agentId: agents[0].uid,
                credentialsId: agentCredentials[0].uid
            };
            const result = await  broker.call("agents.getCredentials", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                uid: agentCredentials[0].uid,
                createdAt: expect.any(Number),
                secret: expect.any(String)
            })
            const regex = /[0-9A-Fa-f]*/g; // test if string is hex
            expect(regex.test(result.secret)).toEqual(true);
            agentCredentials[0].secret = result.secret;
            // console.log(result);
        })

        it("should retrieve agent details", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            let params = {
                agentId: agents[0].uid
            };
            const result = await  broker.call("agents.get", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                uid: agents[0].uid,
                groupId: groups[0].uid,
                label: agents[0].label,
                credentials: expect.any(Object)
            })
            expect(result.credentials[agentCredentials[0].uid]).toEqual({
                uid: agentCredentials[0].uid,
                createdAt: expect.any(Number)
            })
            //console.log(result);
        })

        it("should log in the agent", async () => {
            let params = {
                agentId: agents[0].uid,
                secret: agentCredentials[0].secret
            };
            const result = await  broker.call("agents.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result.sessionId).toEqual(expect.any(String));
            expect(result.authToken).toEqual(expect.any(String));
            // console.log(result);
            agentAuthTokens[0] = result.authToken;
        })

        it("should verify the authToken and return agentToken", async () => {
            opts = { meta: { authToken: agentAuthTokens[0] } };
            let params = {};
            const result = await  broker.call("agents.verifyAuthToken", params, opts)
            const decoded = jwt.decode(result);
            expect(result).toBeDefined();
            expect(decoded.type).toEqual("agentToken");
            expect(decoded.agentId).toEqual(agents[0].uid);
            expect(decoded.sessionId).toEqual(expect.any(String));
            expect(decoded.agent).toEqual({
                uid: agents[0].uid,
                groupId: groups[0].uid,
                label: agents[0].label,
                createdAt: expect.any(Number)
            });
            agentToken = result;
        });

        it("should get access for own group", async () => {
            opts = { meta: { authToken: agentAuthTokens[0], agentToken } };
            let params = {
                groupId: groups[0].uid
            }
            const result = await  broker.call("groups.requestAccessForAgent", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual({
                accessToken: expect.any(String),
            })
            accessTokenAgents[0] = result.accessToken;
        })

        it("should encrypt data with the group key", async () => {
            opts.meta.accessToken = accessTokenAgents[0];
            opts.meta.caller = "v1.store";
            const params = {
                data: {
                    "any": "object"
                }
            }
            const result = await  broker.call("groups.encrypt", params, opts)
            expect(result).toBeDefined();
            encrypted = result;
        })

        it("should decrypt data with the group key", async () => {
            opts.meta.accessToken = accessTokenAgents[0];
            opts.meta.caller = "v2.store";
            const params = {
                encrypted
            }
            const result = await  broker.call("groups.decrypt", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                "any": "object"
            });
        });

        
        it("should log out the agent", async () => {
            opts = {
                meta: {
                    authToken: agentAuthTokens[0]
                }
            }
            let params = {
            };
            const result = await  broker.call("agents.logOut", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["AgentLoggedOut"]).toBeDefined();
            expect(events["AgentLoggedOut"].length).toEqual(1);
            expect(events["AgentLoggedOut"][0].payload.agentId).toEqual(agents[0].uid);
            expect(events["AgentLoggedOut"][0].payload.sessionId).toEqual(expect.any(String));
            expect(events["AgentLoggedOut"][0].payload.authToken).toEqual(agentAuthTokens[0]);
            expect(events["AgentLoggedOut"][0].payload.loggedOutAt).toEqual(expect.any(Number));
        })

        it("should delete the selected credentials", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            let params = {
                agentId: agents[0].uid,
                credentialsId: agentCredentials[0].uid
            };
            const result = await  broker.call("agents.deleteCredentials", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["CredentialsDeleted"]).toBeDefined();
            expect(events["CredentialsDeleted"].length).toEqual(1);
            expect(events["CredentialsDeleted"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["CredentialsDeleted"][0].payload.agentId).toEqual(agents[0].uid);
            expect(events["CredentialsDeleted"][0].payload.credentialsId).toEqual(agentCredentials[0].uid);
        })
   
        it("should fail to log in the agent", async () => {
            opts.meta.accessToken = accessTokenAgents[0];
            let params = {
                agentId: agents[0].uid,
                secret: agentCredentials[0].secret
            };
            expect.assertions(2);
            try {
                await  broker.call("agents.logIn", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UnvalidRequest");
                expect(err.agentId).toEqual(agents[0].uid);
            }
        })

        it("should list the agent in the group", async () => {
            opts.meta = { userToken: userTokens[2], accessToken: accessTokenInternalUsers[2] };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result.uid).toEqual(groups[0].uid);
            expect(result.agents[agents[0].uid]).toEqual({
                uid: agents[0].uid,
                label: agents[0].label,
                createdAt: expect.any(Number)
            })
        })

        it("should return the event log for the agent", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            let params = {
                agentId: agents[0].uid,
                from: new Date(Date.now() - 10000)
            };
            const result = await broker.call("agents.getLog", params, opts);
            expect(result).toBeDefined();
            //console.log(result);
            //console.log(result.limit);
            expect(result.count).toEqual(6);
            expect(result.limit).toBeDefined();
            expect(result.events.length).toEqual(result.count);
            expect(result.events).toEqual(expect.arrayContaining([
                expect.objectContaining({ '$_name': 'AgentCreated' }),
                expect.objectContaining({ '$_name': 'AgentRenamed' }),
                expect.objectContaining({ '$_name': 'CredentialsCreated' }),
                expect.objectContaining({ '$_name': 'AgentLoggedIn' }),
                expect.objectContaining({ '$_name': 'AgentLoggedOut' }),
                expect.objectContaining({ '$_name': 'CredentialsDeleted' })
            ]));
        })

        it("should delete the agent", async () => {
            opts.meta = { userToken: userTokens[0], accessToken: accessTokenInternalUsers[0] };
            let params = {
                agentId: agents[0].uid
            };
            const result = await  broker.call("agents.delete", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["AgentDeleted"]).toBeDefined();
            expect(events["AgentDeleted"].length).toEqual(1);
            expect(events["AgentDeleted"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["AgentDeleted"][0].payload.agentId).toEqual(agents[0].uid);
            expect(events["AgentDeleted"][0].payload.deletedBy).toEqual(users[0].uid);
        })

        it("should list no agents for the group", async () => {
            opts.meta = { userToken: userTokens[2], accessToken: accessTokenInternalUsers[2] };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result.uid).toEqual(groups[0].uid);
            expect(result.agents).toEqual({});
        })

    });

    describe("Groups member state", () => {

        let opts;

        beforeAll(async () => {
            await broker.waitForServices(["users","groups"]);
        })

        it("should list the members of the group", async () => {
            opts = { meta: { userToken: userTokens[3] } };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result).toEqual({
                uid: groups[0].uid,
                createdAt: expect.any(Number),
                label: groups[0].label,
                adminGroup: false,
                invitations: [],
                agents: expect.any(Object),
                members: [{ 
                    user: {
                        uid: users[0].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[0].email,
                        locale: users[0].locale
                    }, 
                    role: "admin"
                },
                { 
                    user: {
                        uid: users[2].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[2].email,
                        locale: users[2].locale
                    }, 
                    role: "member"
                },
                { 
                    user: {
                        uid: users[3].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[3].email,
                        locale: users[3].locale
                    }, 
                    role: "member"
                }],
                keys: expect.any(Object)
            });

        })

        it("should nominate user for role admin", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid
            }
            const result = await broker.call("groups.nominateForAdmin", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupMemberNominatedForAdmin"]).toBeDefined();
            expect(events["GroupMemberNominatedForAdmin"].length).toEqual(1);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.member.user.uid).toEqual(users[2].uid);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.newRole).toEqual("admin");
            expect(events["GroupMemberNominatedForAdmin"][0].payload.nominatedBy.uid).toEqual(users[0].uid);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.nominatedAt).toEqual(expect.any(Number));
        })

        it("should remove nominatation", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid
            }
            const result = await broker.call("groups.removeNomination", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupMemberNominationRemoved"]).toBeDefined();
            expect(events["GroupMemberNominationRemoved"].length).toEqual(1);
            expect(events["GroupMemberNominationRemoved"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberNominationRemoved"][0].payload.member.user.uid).toEqual(users[2].uid);
            expect(events["GroupMemberNominationRemoved"][0].payload.removedBy.uid).toEqual(users[0].uid);
            expect(events["GroupMemberNominationRemoved"][0].payload.removedAt).toEqual(expect.any(Number));
        })

        it("should nominate user for role admin again", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid
            }
            const result = await broker.call("groups.nominateForAdmin", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupMemberNominatedForAdmin"]).toBeDefined();
            expect(events["GroupMemberNominatedForAdmin"].length).toEqual(1);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.member.user.uid).toEqual(users[2].uid);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.newRole).toEqual("admin");
            expect(events["GroupMemberNominatedForAdmin"][0].payload.nominatedBy.uid).toEqual(users[0].uid);
            expect(events["GroupMemberNominatedForAdmin"][0].payload.nominatedAt).toEqual(expect.any(Number));
        })

        it("should accept nomination", async () => {
            opts = { meta: { userToken: userTokens[2] } };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.acceptNomination", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupMemberNominationForAdminAccepted"]).toBeDefined();
            expect(events["GroupMemberNominationForAdminAccepted"].length).toEqual(1);
            expect(events["GroupMemberNominationForAdminAccepted"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberNominationForAdminAccepted"][0].payload.userId).toEqual(users[2].uid);
            expect(events["GroupMemberNominationForAdminAccepted"][0].payload.acceptedAt).toEqual(expect.any(Number));
        })

        it("should revoke admin", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid,
                newRole: "member"
            }
            const result = await broker.call("groups.revokeAdmin", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupAdminRevokationRequested"]).toBeDefined();
            expect(events["GroupAdminRevokationRequested"].length).toEqual(1);
            expect(events["GroupAdminRevokationRequested"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupAdminRevokationRequested"][0].payload.member.user.uid).toEqual(users[2].uid);
            expect(events["GroupAdminRevokationRequested"][0].payload.newRole).toEqual("member");
            expect(events["GroupAdminRevokationRequested"][0].payload.requestedBy.uid).toEqual(users[0].uid);
            expect(events["GroupAdminRevokationRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
        })

        it("should remove revokation request", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid
            }
            const result = await broker.call("groups.removeRevokationRequest", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupAdminRevokationRemoved"]).toBeDefined();
            expect(events["GroupAdminRevokationRemoved"].length).toEqual(1);
            expect(events["GroupAdminRevokationRemoved"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupAdminRevokationRemoved"][0].payload.member.user.uid).toEqual(users[2].uid);
            expect(events["GroupAdminRevokationRemoved"][0].payload.removedBy.uid).toEqual(users[0].uid);
            expect(events["GroupAdminRevokationRemoved"][0].payload.removedAt).toEqual(expect.any(Number));
        })

        it("should revoke admin again", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid,
                newRole: "member"
            }
            const result = await broker.call("groups.revokeAdmin", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupAdminRevokationRequested"]).toBeDefined();
            expect(events["GroupAdminRevokationRequested"].length).toEqual(1);
            expect(events["GroupAdminRevokationRequested"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupAdminRevokationRequested"][0].payload.member.user.uid).toEqual(users[2].uid);
            expect(events["GroupAdminRevokationRequested"][0].payload.newRole).toEqual("member");
            expect(events["GroupAdminRevokationRequested"][0].payload.requestedBy.uid).toEqual(users[0].uid);
            expect(events["GroupAdminRevokationRequested"][0].payload.requestedAt).toEqual(expect.any(Number));
        })

        it("should accept revokation", async () => {
            opts = { meta: { userToken: userTokens[2] } };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.acceptRevokation", params, opts);
            expect(result).toBeDefined();
            expect(result).toEqual(true);
            expect(events["GroupAdminRevokationAccepted"]).toBeDefined();
            expect(events["GroupAdminRevokationAccepted"].length).toEqual(1);
            expect(events["GroupAdminRevokationAccepted"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupAdminRevokationAccepted"][0].payload.userId).toEqual(users[2].uid);
            expect(events["GroupAdminRevokationAccepted"][0].payload.acceptedAt).toEqual(expect.any(Number));
        })

        it("should list the group for the third user before leaving", async () => {
            opts = { meta: { authToken: authTokens[3] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.groups[groups[0].uid]).toBeDefined();
        });

        it("should leave the group", async () => {
            opts = { meta: { userToken: userTokens[3] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.leave", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupMemberLeft"]).toBeDefined();
            expect(events["GroupMemberLeft"].length).toEqual(1);
            expect(events["GroupMemberLeft"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberLeft"][0].payload.member).toEqual({
                uid: users[3].uid,
                createdAt: expect.any(Number),
                confirmedAt: expect.any(Number),
                email: users[3].email,
                locale: users[3].locale        
            });
            expect(events["GroupMemberLeft"][0].payload.leftAt).toEqual(expect.any(Number));            
        })

        it("should display the members of the group without the one who left it", async () => {
            opts = { meta: { userToken: userTokens[2] } };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result).toEqual({
                uid: groups[0].uid,
                createdAt: expect.any(Number),
                label: groups[0].label,
                adminGroup: false,
                invitations: [],
                agents: expect.any(Object),
                members: [{ 
                    user: {
                        uid: users[0].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[0].email,
                        locale: users[0].locale
                    }, 
                    role: "admin"
                },
                { 
                    user: {
                        uid: users[2].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[2].email,
                        locale: users[2].locale
                    }, 
                    role: "member"
                }],
                keys: expect.any(Object)
            });

        })

        it("should not list the group for the user who left it", async () => {
            opts = { meta: { authToken: authTokens[3] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.groups[groups[0].uid]).not.toBeDefined();
        });

        it("should remove member of the group", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid,
                userId: users[2].uid
            };
            const result = await  broker.call("groups.removeMember", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupMemberRemoved"]).toBeDefined();
            expect(events["GroupMemberRemoved"].length).toEqual(1);
            expect(events["GroupMemberRemoved"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupMemberRemoved"][0].payload.userId).toEqual(users[2].uid);
            expect(events["GroupMemberRemoved"][0].payload.removedAt).toEqual(expect.any(Number));            
        })

        it("should display the members of the group without the one who left it", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result).toEqual({
                uid: groups[0].uid,
                createdAt: expect.any(Number),
                label: groups[0].label,
                adminGroup: false,
                invitations: [],
                agents: expect.any(Object),
                members: [{ 
                    user: {
                        uid: users[0].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[0].email,
                        locale: users[0].locale
                    }, 
                    role: "admin"
                }],
                keys: expect.any(Object)
            });

        })

        it("should not list the group for the user who left it", async () => {
            opts = { meta: { authToken: authTokens[2] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.groups[groups[0].uid]).not.toBeDefined();
        });


    });

    describe("Logs", () => {

        let opts;

        beforeAll(async () => {
            await broker.waitForServices(["users"]);
        })

        it("should retrieve log for user A", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.getLog", params, opts)
            expect(result).toBeDefined();
            expect(result.events.length > 0).toEqual(true);
            expect(result.count).toEqual(result.events.length);
            expect(result.limit).toBeDefined();
        })

        it("should retrieve log for group A", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.getLog", params, opts)
            expect(result).toBeDefined();
            expect(result.events.length > 0).toEqual(true);
            expect(result.count).toEqual(result.events.length);
            expect(result.limit).toBeDefined();
        })
    });

    describe("Group deletion", () => {

        let opts, deletionToken;

        beforeAll(async () => {
            await broker.waitForServices(["users","groups"]);
        })

        it("should request group deletion", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.requestDeletion", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupDeletionRequested"]).toBeDefined();
            expect(events["GroupDeletionRequested"].length).toEqual(1);
            expect(events["GroupDeletionRequested"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupDeletionRequested"][0].payload.requestedBy.uid).toEqual(users[0].uid);
            expect(events["GroupDeletionRequested"][0].payload.requestedAt).toEqual(expect.any(Number));            
        })

        it("should cancel deletion request", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.cancelDeletionRequest", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupDeletionCanceled"]).toBeDefined();
            expect(events["GroupDeletionCanceled"].length).toEqual(1);
            expect(events["GroupDeletionCanceled"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupDeletionCanceled"][0].payload.canceledBy.uid).toEqual(users[0].uid);
            expect(events["GroupDeletionCanceled"][0].payload.canceledAt).toEqual(expect.any(Number));            
        })

        it("should request group deletion again", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.requestDeletion", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupDeletionRequested"]).toBeDefined();
            expect(events["GroupDeletionRequested"].length).toEqual(1);
            expect(events["GroupDeletionRequested"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupDeletionRequested"][0].payload.requestedBy.uid).toEqual(users[0].uid);
            expect(events["GroupDeletionRequested"][0].payload.requestedAt).toEqual(expect.any(Number));            
        })

        it("should confirm deletion request", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {
                groupId: groups[0].uid
            };
            const result = await  broker.call("groups.confirmDeletion", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupDeletionConfirmed"]).toBeDefined();
            expect(events["GroupDeletionConfirmed"].length).toEqual(1);
            expect(events["GroupDeletionConfirmed"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupDeletionConfirmed"][0].payload.deletionToken).toEqual(expect.any(String));
            expect(events["GroupDeletionConfirmed"][0].payload.confirmedBy.uid).toEqual(users[0].uid);
            expect(events["GroupDeletionConfirmed"][0].payload.confirmedAt).toEqual(expect.any(Number));            
            deletionToken = events["GroupDeletionConfirmed"][0].payload.deletionToken;
        })

        it("should delete the group", async () => {
            opts = {};
            let params = {
                deletionToken
            };
            const result = await  broker.call("groups.delete", params, opts)
            expect(result).toEqual(true);
            expect(events["GroupDeleted"]).toBeDefined();
            expect(events["GroupDeleted"].length).toEqual(1);
            expect(events["GroupDeleted"][0].payload.groupId).toEqual(groups[0].uid);
            expect(events["GroupDeleted"][0].payload.deletionToken).toEqual(deletionToken);
            expect(events["GroupDeleted"][0].payload.deletedAt).toEqual(expect.any(Number));            
        })

        it("should not list the group for the admin after deletion", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.uid).toEqual(users[0].uid);
            expect(result.groups[groups[0].uid]).not.toBeDefined();
        });

    });

    describe("User deletion", () => {

        let opts, deletionToken;

        beforeAll(async () => {
            await broker.waitForServices(["users","groups"]);
        })

        it("should request user deletion", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.requestDeletion", params, opts)
            expect(result).toEqual(true);
            expect(events["UserDeletionRequested"]).toBeDefined();
            expect(events["UserDeletionRequested"].length).toEqual(1);
            expect(events["UserDeletionRequested"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserDeletionRequested"][0].payload.requestedAt).toEqual(expect.any(Number));            
        })

        it("should cancel deletion request", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.cancelDeletionRequest", params, opts)
            expect(result).toEqual(true);
            expect(events["UserDeletionCanceled"]).toBeDefined();
            expect(events["UserDeletionCanceled"].length).toEqual(1);
            expect(events["UserDeletionCanceled"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserDeletionCanceled"][0].payload.canceledAt).toEqual(expect.any(Number));            
        })

        it("should request group deletion again", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.requestDeletion", params, opts)
            expect(result).toEqual(true);
            expect(events["UserDeletionRequested"]).toBeDefined();
            expect(events["UserDeletionRequested"].length).toEqual(1);
            expect(events["UserDeletionRequested"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserDeletionRequested"][0].payload.requestedAt).toEqual(expect.any(Number));            
        })

        it("should confirm deletion request", async () => {
            opts = { meta: { userToken: userTokens[0] } };
            let params = {};
            const result = await  broker.call("users.confirmDeletion", params, opts)
            expect(result).toEqual(true);
            expect(events["UserDeletionConfirmed"]).toBeDefined();
            expect(events["UserDeletionConfirmed"].length).toEqual(1);
            expect(events["UserDeletionConfirmed"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserDeletionConfirmed"][0].payload.deletionToken).toEqual(expect.any(String));
            expect(events["UserDeletionConfirmed"][0].payload.confirmedAt).toEqual(expect.any(Number));            
            deletionToken = events["UserDeletionConfirmed"][0].payload.deletionToken;
        })

        it("should delete the user", async () => {
            opts = {};
            let params = {
                deletionToken
            };
            const result = await  broker.call("users.delete", params, opts)
            expect(result).toEqual(true);
            expect(events["UserDeleted"]).toBeDefined();
            expect(events["UserDeleted"].length).toEqual(1);
            expect(events["UserDeleted"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserDeleted"][0].payload.deletionToken).toEqual(deletionToken);
            expect(events["UserDeleted"][0].payload.deletedAt).toEqual(expect.any(Number));            
        })

        it("should fail with group deletion request: is still group member", async () => {
            opts = { meta: { userToken: userTokens[3] } };
            let params = {};
            expect.assertions(3);
            try {
                await  broker.call("users.requestDeletion", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UserIsGroupMember");
                expect(err.userId).toEqual(users[3].uid);
                expect(err.groups).toContainEqual(groups[1].uid);
            }
        })


    });


    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});