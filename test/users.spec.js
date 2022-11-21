"use strict";

const { ServiceBroker } = require("moleculer");
const { Users } = require("../index");
const { Groups } = require("../index");
const { Serializer } = require("../lib/provider/serializer");
const { Publisher } = require("../lib/provider/publisher");
const { Keys } = require("../lib/provider/keys");
const { Encryption } = require("../lib/provider/encryption");

// helper & mocks
const { credentials } = require("./helper/credentials");
const { KeysMock } = require("./helper/keys");
const { Collect, events, initEvents } = require("./helper/collect");

const { v4: uuid } = require("uuid");
const jwt = require("jsonwebtoken");

const timestamp = new Date();
const users = [
    {
        uid: uuid(),
        email: `admin${timestamp.valueOf()}@imicros.de`,
        password: "?My::secret!",
        locale: "enUS"
    },{
        uid: uuid(),
        email: `userB${timestamp.valueOf()}@imicros.de`,
        password: "?My:userB:secret!",
        locale: "enUS"
    },{
        uid: uuid(),
        email: `userC${timestamp.valueOf()}@imicros.de`,
        password: "?My:userC:secret!",
        locale: "deDE"
    }
]
const groups = [
    {
        uid: uuid(),
        label: "my first group"
    }
]

// Build provider for MemoryDB
const { DefaultDatabase } = require("../lib/cqrs/cqrs");
const database = new  DefaultDatabase();
const MemoryDB = {
    async created () {
        this.db = database;
    }
}

// Build provider for CassandraDB
const { DB } = require("../lib/db/cassandra");
const CassandraDB = {
    async created () {
        this.db = new DB({
            logger: this.broker.logger,
            encryption: this.encryption,
            options: { 
                contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth"
            },
            services: {}
        });
    },
    async started () {
        await this.db.connect();
    },
    async stopped () {
        await this.db.disconnect();
    }
}

describe.each([
    { database: MemoryDB, name: "MemoryDB" } //,
    // { database: CassandraDB, name: "CassandraDB" }
])("Test user service with database $name", ({ database }) => {

    let broker, userTokens = [];
    
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
                logLevel: "info" //"debug"
            });
            broker.createService({
                // sequence of providers is important: 
                // Keys and Serializer must be first, as they are used by Encryption
                // Database again depends on Encryption
                mixins: [Users, database, Publisher, Encryption, Serializer, Keys], 
                dependencies: ["v1.keys"],
                settings: {
                    keys: {
                        client: {
                            name: credentials.serviceId,
                            token: credentials.authToken
                        },
                        service: "v1.keys"
                    },
                    repository:{
                        snapshotCounter: 2  // new snapshot after 2 new events
                    }
                }
            });
            broker.createService({
                mixins: [Groups, database, Publisher, Encryption, Serializer, Keys], 
                dependencies: ["v1.keys"],
                settings: {
                    keys: {
                        client: {
                            name: credentials.serviceId,
                            token: credentials.authToken
                        },
                        service: "v1.keys"
                    }
                }
            })
            broker.createService(Collect);
            broker.createService(KeysMock);
            await broker.start();
            expect(broker).toBeDefined()
        }, 30000);

    });

    describe("Test users create and confirm", () => {   
        let opts, authToken, sessionId, confirmationToken;
        
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
            const result = await  broker.call("users.create", params, opts)
            expect(result.userId).toBeDefined();
            expect(result.userId).toEqual(users[0].uid);
            expect(events["UserCreated"]).toBeDefined();
            expect(events["UserCreated"].length).toEqual(1);
            expect(events["UserCreated"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserCreated"][0].payload.email).toEqual(users[0].email);
            expect(events["UserCreated"][0].payload.locale).toEqual(users[0].locale);
            expect(events["UserCreated"][0].payload.createdAt).toEqual(expect.any(Number));
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
                await broker.call("users.create", params, opts);
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
                await broker.call("users.create", params, opts);
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
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authToken = result.authToken;
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
            const result = await  broker.call("users.create", params, opts)
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
            const result = await  broker.call("users.logIn", params, opts)
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

    });

    describe("Test verify authToken", () => {
        let opts, authToken, sessionId;

        it("should login first user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authToken = result.authToken;
        });

        it("should verify the authToken and return userToken for first user", async () => {
            opts = { meta: { authToken } };
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
        
        it("should login second user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[1].email,
                password: users[1].password,
                locale: users[1].locale
            };
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[1].locale
            })
            authToken = result.authToken;
        });

        it("should verify the authToken and return userToken for second user", async () => {
            opts = { meta: { authToken } };
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
        let opts, authToken, sessionId;

        it("should login the user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authToken = result.authToken;
        });

        it("should change user password", async () => {
            opts = { meta: { authToken } };
            users[0].password = "?My:changed:secret!"
            let params = {
                password: users[0].password
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
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
            expect(events["UserLoggedOut"]).toBeDefined();
            expect(events["UserLoggedOut"].length).toEqual(1);
            expect(events["UserLoggedOut"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserLoggedOut"][0].payload.sessionId).toEqual(sessionId);
            expect(events["UserLoggedOut"][0].payload.authToken).toEqual(authToken);
            expect(events["UserLoggedOut"][0].payload.loggedOutAt).toEqual(expect.any(Number));
        })

        it("should fail changing user password with logged out session", async () => {
            opts = { meta: { authToken } };
            let params = {
                password: "?My:updated:secret!"
            };
            expect.assertions(2);
            try {
                await broker.call("users.changePassword", params, opts);
            } catch (err) {
                expect(err.message).toEqual("UnvalidToken");
                expect(err.token).toEqual(authToken);
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
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authToken = result.authToken;
        });

        it("should log out again", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.logOut", params, opts)
            expect(result).toEqual(true);
            expect(events["UserLoggedOut"]).toBeDefined();
            expect(events["UserLoggedOut"].length).toEqual(1);
            expect(events["UserLoggedOut"][0].payload.userId).toEqual(users[0].uid);
            expect(events["UserLoggedOut"][0].payload.sessionId).toEqual(sessionId);
            expect(events["UserLoggedOut"][0].payload.authToken).toEqual(authToken);
            expect(events["UserLoggedOut"][0].payload.loggedOutAt).toEqual(expect.any(Number));
        })

    });

    describe("Test groups service", () => {   

        let opts, sessionId, authToken, confirmationToken, invitationToken;
        
        beforeEach(() => {
            opts = { 
                meta: {
                    userToken: userTokens[0]
                }
            };
        });
        
        it("should log user", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: users[0].email,
                password: users[0].password,
                locale: users[0].locale
            };
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[0].locale
            })
            authToken = result.authToken;
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
                members: [{ 
                    user: {
                        uid: users[0].uid,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: users[0].email,
                        locale: users[0].locale
                    }, 
                    role: "admin"
                }]
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
            opts = { meta: { authToken } };
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
            const result = await  broker.call("users.create", params, opts)
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
            const result = await  broker.call("users.logIn", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: users[2].locale
            })
            authToken = result.authToken;
        });

        it("should list the invitation for the invited user", async () => {
            opts = { meta: { authToken } };
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
            opts = { meta: { authToken } };
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

        it("should verify the authToken and return userToken for first user", async () => {
            opts = { meta: { authToken } };
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
        
    });
        
    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});