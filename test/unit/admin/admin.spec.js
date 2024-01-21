"use strict";

const { ServiceBroker } = require("moleculer");
const { Middleware: ChannelsMiddleware } = require("@moleculer/channels");
const { AdminService } = require("../../../index");
const { UsersService } = require("../../../index");
const { GroupsService } = require("../../../index");
const { Serializer } = require("../../../lib/provider/serializer");
const { Publisher } = require("../../../lib/provider/publisher");
const { Keys } = require("../../../lib/provider/keys");
const { Encryption } = require("../../../lib/provider/encryption");
const { Vault } = require("../../../lib/provider/vault");
const { Constants } = require("../../../lib/classes/util/constants");

// const { logLevel } = require("kafkajs");

// helper & mocks
const { credentials } = require("../../helper/credentials");
const { VaultMock } = require("../../helper/vault");
const { Collect, events, initEvents } = require("../../helper/collect");

const jwt = require("jsonwebtoken");
const { v4: uuid } = require("uuid");

const timestamp = new Date();
const admin = {
        email: `admin${timestamp.valueOf()}@imicros.de`,
        password: "ANRC4ZtNmYmpwhzCVAeuRRTX",
        locale: "deDE"
}

const groups = [
    {
        uid: uuid(),
        label: "my first group"
    },
    {
        uid: uuid(),
        label: "second group"
    }
]

const adapter = process.env.KAFKA_BROKER ? {
    type: "Kafka",
    options: {
        // group
        // maxRetries: 5,
        kafka: {
            brokers: [process.env.KAFKA_BROKER],
            ssl: null,     // refer to kafkajs documentation
            sasl: null,   // refer to kafkajs documentation
            connectionTimeout: 1000,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        }
    }
} : {
    type: "Fake",
    options: {}
}

const received = [];
const Inspect = {
    name: "inspect",
    channels: {
        async "imicros.internal.events" (wrappedEvent, raw) {
            // console.log("Received:", { wrappedEvent, raw });
            received.push(wrappedEvent);
        }
        /*
        "imicros.internal.events": {
            context: true,
            async handler (ctx) {
                console.log("Received:", { ctx });
            }
        }
        */
    }
}

// Build provider for MemoryDB
const { DefaultDatabase } = require("../../../lib/classes/cqrs/cqrs");
const database = new  DefaultDatabase();
const MemoryDB = {
    async created () {
        this.db = database;
    }
}

// Build provider for CassandraDB
const { DB } = require("../../../lib/classes/db/cassandraCQRS");
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
    { database: MemoryDB, name: "MemoryDB" } /*,
    { database: CassandraDB, name: "CassandraDB" } */
])("Test user service with database $name", ({ database }) => {

    let broker, authToken, sessionId, adminGroupId;
    
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
                logLevel: "info", //"debug"
                middlewares: [
                    ChannelsMiddleware({
                        adapter
                    })
                ]
            });
            broker.createService(Inspect);
            broker.createService({
                mixins: [UsersService, database, Publisher, Encryption, Serializer, Keys, Vault], 
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
                mixins: [GroupsService, database, Publisher, Encryption, Serializer, Keys, Vault],
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
                // sequence of providers is important: 
                // Keys and Serializer must be first, as they are used by Encryption
                // Database again depends on Encryption
                mixins: [AdminService, database, Publisher, Encryption, Serializer, Keys, Vault], 
                dependencies: ["v1.vault","groups","users"],
                settings: {
                    email: admin.email,
                    initialPassword: admin.password,
                    locale: admin.locale,
                    events: [
                        "UserConfirmationRequested",
                        "UserPasswordResetRequested",
                        "UserDeletionRequested",
                        "UserDeletionConfirmed",
                        "GroupCreated",
                        "GroupDeletionConfirmed"
                    ],
                    channel: "imicros.internal.events",
                    adapter: "Kafka",
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
            broker.createService(Collect);
            broker.createService(VaultMock);
            await broker.start();
            expect(broker).toBeDefined()
        }, 30000);

    });

    describe("Test admin", () => {

        let opts = {}, accessToken, userToken;

        it("should login the admin", async () => {
            sessionId = uuid();
            let params = {
                sessionId,
                email: admin.email,
                password: admin.password,
                locale: admin.locale
            };
            const result = await  broker.call("users.logInPWA", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                authToken: expect.any(String),
                sessionId,
                locale: admin.locale
            })
            authToken = result.authToken;
        });

        it("should list the admin group", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.get", params, opts)
            expect(result).toBeDefined();
            expect(result.groups[Object.keys(result.groups)[0]]).toBeDefined();
            expect(result.groups[Object.keys(result.groups)[0]]).toEqual({
                groupId: expect.any(String),
                label: "authm.admin.group",
                role: "admin",
                joinedAt: expect.any(Number)
            })
            admin.id = result.uid;
            adminGroupId = Object.keys(result.groups)[0];
        });

        it("should verify the authToken and return userToken for the admin", async () => {
            opts = { meta: { authToken } };
            let params = {};
            const result = await  broker.call("users.verifyAuthToken", params, opts)
            expect(result).toBeDefined();
            userToken = result;
        });

        it("retrieve access token", async () => {
            opts = { meta: { userToken } };
            let params = {
                groupId: adminGroupId
            };
            const result = await  broker.call("groups.requestAccessForMember", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual({
                accessToken: expect.any(String),
            })
            accessToken = result.accessToken;
        });

        it("should retrieve the created group", async () => {
            opts = { meta: { userToken, accessToken } };
            let params = {
                groupId: adminGroupId
            }
            const result = await broker.call("groups.get", params, opts);
            expect(result).toEqual({
                uid: adminGroupId,
                createdAt: expect.any(Number),
                label: "authm.admin.group",
                adminGroup: true,
                members: [{ 
                    user: {
                        uid: admin.id,
                        createdAt: expect.any(Number),
                        confirmedAt: expect.any(Number),
                        email: admin.email,
                        locale: admin.locale
                    }, 
                    role: "admin"
                }],
                keys: expect.any(Object)
            });
        });


        it("verify access token and retrieve internal access token", async () => {
            opts = { meta: { userToken, authToken: accessToken } };
            let params = {};
            const result = await  broker.call("groups.verifyAccessToken", params, opts)
            expect(result).toBeDefined();
            expect(result).toEqual(expect.any(String))
            const decoded = jwt.decode(result);
            expect(decoded.type).toEqual(Constants.TOKEN_TYPE_ACCESS_INTERNAL);
            expect(decoded.userId).toEqual(admin.id);
            expect(decoded.groupId).toEqual(adminGroupId);
            expect(decoded.role).toEqual("admin");
            expect(decoded.adminGroup).toEqual(true);
        });

    });

    describe("Test emit & receive", () => {   
        it("should emit and receive an event", async () => {
            const opts = { meta: { owner: groups[0].uid } }
            const payload = {
                any: "content"
            }
            const result = await  broker.emit("UserConfirmationRequested", payload, opts);
            // console.log(events);
            expect(result).toBeDefined();
            expect(events["UserConfirmationRequested"].length).toEqual(1);
            //console.log(events["UserConfirmationRequested"])
            expect(events["UserConfirmationRequested"][0].payload).toEqual(payload);
            // wait some time for processing
            await new Promise(resolve => setTimeout(resolve, 500));
            expect(received.length).toEqual(1);
            expect(received[0].event).toEqual("UserConfirmationRequested");
            expect(received[0].owner).toEqual(adminGroupId);
            expect(received[0].origin).toEqual(groups[0].uid);
            expect(received[0].payload).toEqual({
                any: "content"
            });
        });

    });


    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        }, 10000);
    });
    
});