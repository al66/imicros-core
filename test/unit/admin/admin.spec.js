"use strict";

const { ServiceBroker } = require("moleculer");
const { AdminService } = require("../../../index");
const { UsersService } = require("../../../index");
const { GroupsService } = require("../../../index");
const { Serializer } = require("../../../lib/provider/serializer");
const { Publisher } = require("../../../lib/provider/publisher");
const { KeysService } = require("../../../index");
const { KeysProvider } = require("../../../index");
const { Encryption } = require("../../../lib/provider/encryption");
const { VaultProvider } = require("../../../lib/provider/vault");
const { Constants } = require("../../../lib/classes/util/constants");

// helper & mocks
const { credentials } = require("../../helper/credentials");
const { VaultServiceMock } = require("../../mocks/vault");
const { CollectAdminEvents, CollectEvents, events, initEvents } = require("../../helper/collect");

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
                logLevel: "info" //"debug"
            });
            broker.createService({
                mixins: [UsersService, database, Publisher, Encryption, Serializer, KeysProvider, VaultProvider], 
                dependencies: ["v1.vault","v1.keys"],
                settings: {
                    repository:{
                        snapshotCounter: 2  // new snapshot after 2 new events
                    },
                    vault: {
                        service: "v1.vault"
                    }
                }
            });
            broker.createService({
                mixins: [GroupsService, database, Publisher, Encryption, Serializer, KeysProvider, VaultProvider],
                dependencies: ["v1.vault","v1.keys"],
                settings: {
                    vault: {
                        service: "v1.vault"
                    }
                }
            })
            broker.createService({
                // sequence of providers is important: 
                // Keys and Serializer must be first, as they are used by Encryption
                // Database again depends on Encryption
                mixins: [AdminService, database, Publisher, Encryption, Serializer, KeysProvider, VaultProvider], 
                dependencies: ["v1.vault","v1.keys","v1.groups","v1.users"],
                settings: {
                    email: admin.email,
                    initialPassword: admin.password,
                    locale: admin.locale,
                    repository:{
                        snapshotCounter: 2  // new snapshot after 2 new events
                    },
                    vault: {
                        service: "v1.vault"
                    }
                }
            });
            broker.createService(CollectAdminEvents);
            broker.createService(CollectEvents);
            broker.createService(KeysService);
            broker.createService(VaultServiceMock);
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
            const result = await  broker.call("v1.users.logInPWA", params, opts)
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
            const result = await  broker.call("v1.users.get", params, opts)
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
            const result = await  broker.call("v1.users.verifyAuthToken", params, opts)
            expect(result).toBeDefined();
            userToken = result;
        });

        it("retrieve access token", async () => {
            opts = { meta: { userToken } };
            let params = {
                groupId: adminGroupId
            };
            const result = await  broker.call("v1.groups.requestAccessForMember", params, opts)
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
            const result = await broker.call("v1.groups.get", params, opts);
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
                keys: expect.any(Object),
                services: expect.any(Object)
            });
        });


        it("verify access token and retrieve internal access token", async () => {
            opts = { meta: { userToken, authToken: accessToken } };
            let params = {};
            const result = await  broker.call("v1.groups.verifyAccessToken", params, opts)
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
            const opts = { meta: { ownerId: groups[0].uid }, groups: ["users","groups","agents","admin"] }
            const payload = {
                any: "content"
            }
            const result = await  broker.emit("UserConfirmationRequested", payload, opts);
            expect(result).toBeDefined();
            console.log(events["UserConfirmationRequested"])
            expect(events["UserConfirmationRequested"].length).toEqual(2);  
            expect(events["UserConfirmationRequested"][0].ctx.meta.ownerId).toEqual(groups[0].uid);
            expect(events["UserConfirmationRequested"][0].payload).toEqual(payload);
            expect(events["UserConfirmationRequested"][1].ctx.meta.ownerId).toEqual(adminGroupId);
            expect(events["UserConfirmationRequested"][1].ctx.meta.origin).toEqual(groups[0].uid);
            expect(events["UserConfirmationRequested"][1].payload).toEqual(payload);
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