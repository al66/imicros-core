const { ServiceBroker } = require("moleculer");
const { DB } = require("../../../lib/classes/db/cassandraBusinessRules");
const { VaultServiceAccess } = require("../../../lib/classes/provider/vault");
const { GroupsServiceAccess } = require("../../../lib/classes/provider/groups");
const { v4: uuid, v1: uuid1 } = require("uuid");
const { Constants } = require("../../../lib/classes/util/constants");

// helper & mocks
const { StoreServiceMock, put, get } = require("../../mocks/store");
const { GroupsServiceMock } = require("../../mocks/groups");
const { VaultServiceMock } = require("../../mocks/vault");
const fs = require("fs");
const { parse } = require("path");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_DECISION || "imicros_decision"
    } 
}

describe("Test database connection", () => {
    let broker, db, serviceId = uuid(), accessToken, xmlData, parsed, userId = uuid(), owner = [uuid(),uuid()];

    beforeAll(() => {
        xmlData = "<xml>test</xml>";
        parsed = { 
            id: "myDecision", 
            ast: { any: "expression" } 
        };
    })

    beforeEach(() => {
        opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: owner[0], acl: { ownerId: owner[0] } }};
    });
    
    afterEach(() => {
    });

    describe("Test database initialization", () => {

        it("should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            [GroupsServiceMock, VaultServiceMock, StoreServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(broker).toBeDefined();
        });

        it("should initialize the connector and connect to database", async () => {
            const vault = new VaultServiceAccess({ 
                broker: broker,
                logger: broker.logger,
                options: {} 
            })
            const groups = new GroupsServiceAccess({
                broker: broker,
                logger: broker.logger,
                vault: vault,
                options: {} 
            });
            db = new DB({logger: broker.logger, groups, options: settings.db });
            const result = await groups.requestAccessForService({ groupId: owner[0], serviceId });
            expect(result).toBeDefined();
            expect(result.accessToken).toBeDefined();
            accessToken = result.accessToken;
            await db.connect();
            expect(db instanceof DB).toEqual(true);
            expect(db.groups instanceof GroupsServiceAccess).toEqual(true);
            expect(db.groups.vault instanceof VaultServiceAccess).toEqual(true);
        }, 30000);

    });

    describe("Test database connector", () => {

        it("should save a decision", async () => {
            const result = await db.save({ 
                owner: owner[0],
                accessToken,
                xmlData,
                parsed
            });
            expect(result).toEqual(true);
        })

        it("should get a decision", async () => {
            const result = await db.get({ 
                owner: owner[0],
                accessToken,
                businessRuleId: parsed.id,
                xml: true
            });
            expect(result).toBeDefined();
            expect(result.xmlData).toEqual(xmlData);
            expect(result.parsed).toEqual(parsed);
        })

        it("should get the parsed part only", async () => {
            const result = await db.get({ 
                owner: owner[0],
                accessToken,
                businessRuleId: parsed.id
            });
            expect(result).toBeDefined();
            expect(result.xmlData).not.toBeDefined();
            expect(result.parsed).toEqual(parsed);
        })

        it("should get a list of saved decisions", async () => {
            const result = await db.getList({ 
                owner: owner[0],
                accessToken
            });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result[0].businessRuleId).toEqual(parsed.id);
        })

        it("should delete a decision", async () => {
            const result = await db.delete({ 
                owner: owner[0],
                accessToken,
                businessRuleId: parsed.id
            });
            expect(result).toEqual(true);
        });

        it("should get an empty list of saved decisions", async () => {
            const result = await db.getList({ 
                owner: owner[0],
                accessToken
            });
            expect(result).toBeDefined();
            expect(result.length).toEqual(0);
        })

        it("should retrieve the events of a decision", async () => {
            const result = await db.getEvents({ 
                owner: owner[0],
                accessToken,
                businessRuleId: parsed.id
            });
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual({ event: "saved", time: expect.any(Date), accessToken, parsed, xmlData });
            expect(result).toContainEqual({ event: "deleted", time: expect.any(Date), accessToken, businessRuleId: parsed.id });
        })

    });

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await db.disconnect();
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});
    