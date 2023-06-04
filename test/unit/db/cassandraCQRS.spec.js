"use strict";

const { ServiceBroker } = require("moleculer");
//const { AclMiddleware } = require("imicros-acl");
const { DB } = require("../../../lib/db/cassandraCQRS");
const { v4: uuid } = require("uuid");
const { Keys } = require("../../../lib/util/keys");
const { Encryption } = require("../../../lib/util/encryption");
const { Serializer } = require("../../../lib/util/serializer");

// helper & mocks
// const { credentials } = require("./helper/credentials");
const { keysMock } = require("../../helper/keys");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
        userTable: "user"
    } 
}

const timestamp = new Date();
const key = `U${timestamp.valueOf()}`;
const keyB = `UB${timestamp.valueOf()}`;
const keyC = `UC${timestamp.valueOf()}`;

describe("Test database connection", () => {
    let broker, opts, db, keys, encryption, serializer;

    beforeEach(() => { 
        // opts = meta
    })

    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            // broker.createService(ACL);
            await broker.start();
            keysMock.addKey();
            expect(broker).toBeDefined();
        });

    });

    describe("Test database connector", () => {

        it("it should initialize the connector and connect to database", async () => {
            serializer = new Serializer();
            encryption = new Encryption({ logger: broker.logger, keys: keysMock, serializer, options: {} });
            db = new DB({logger: broker.logger, encryption, options: settings.db, services: settings.services});
            await db.connect();
            expect(db instanceof DB).toEqual(true);
        });

    });

    describe("Test CQRS", () => {
        let uid = uuid(), timeuuid;

        it("it should fail to add an event for a non-existing version", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.persist({ 
                uid,
                version: 1,
                event: { type: "wrong" }});
            expect(result).toEqual(false);
        });

        it("it should add an event", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.persist({ 
                uid,
                version: 0,
                event: { type: "any" }});
            expect(result).toEqual(true);
        });

        it("it should add a second event", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.persist({ 
                uid,
                version: 0,
                event: { type: "second" }});
            expect(result).toEqual(true);
        });

        it("it should read all events", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.read({ 
                uid
            });
            expect(result.uid).toEqual(uid);
            expect(result.events[0]).toEqual(expect.objectContaining({ type: "any" }));
            timeuuid = result.events[0].$_timeuuid;
            expect(result.events[1]).toEqual(expect.objectContaining({ type: "second" }));
        });

        it("it should save a snapshot", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.saveSnapshot({ 
                uid,
                version: 1,
                snapshot: { state: "first event applied" },
                timeuuid
            });
            expect(result).toEqual(true);
        });

        it("it should fail to save a snapshot for a previous version", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.saveSnapshot({ 
                uid,
                version: 1,
                snapshot: { state: "first event applied" },
                timeuuid
            });
            expect(result).toEqual(false);
        });

        it("it should return all events", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.read({ 
                uid,
                complete: true
            });
            expect(result.uid).toEqual(uid);
            expect(result.events[0]).toEqual(expect.objectContaining({ type: "any" }));
            expect(result.events[1]).toEqual(expect.objectContaining({ type: "second" }));
        });

        it("it should return the snapshot and the last event", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.read({ 
                uid
            });
            expect(result.uid).toEqual(uid);
            expect(result.snapshot).toEqual({ state: "first event applied" });
            expect(result.timeuuid).toEqual(timeuuid);
            expect(result.version).toEqual(1);
            expect(result.events.length).toEqual(1);
            expect(result.events[0]).toEqual(expect.objectContaining({ type: "second" }));
        });

        it("it should add a third event", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.persist({ 
                uid,
                version: 1,
                event: { type: "third" }});
            expect(result).toEqual(true);
        });

        it("it should return the snapshot and the last two events", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.read({ 
                uid
            });
            expect(result.uid).toEqual(uid);
            expect(result.snapshot).toEqual({ state: "first event applied" });
            expect(result.timeuuid).toEqual(timeuuid);
            expect(result.version).toEqual(1);
            expect(result.events.length).toEqual(2);
            expect(result.events[0]).toEqual(expect.objectContaining({ type: "second" }));
            expect(result.events[1]).toEqual(expect.objectContaining({ type: "third" }));
        });

        it("it should preserve a key", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.preserveUniqueKey({ 
                key: `${timestamp}@imicros.de`,
                uid: uid
            });
            expect(result).toEqual(uid);
        })

        it("it should read the key again", async () => {
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.getIdByUniqueKey({ 
                key: `${timestamp}@imicros.de`
            });
            expect(result).toEqual(uid);
        })

        it("it should fail to preserve the key again", async () => {
            const uid2 = uuid();
            const CQRS = db.getCQRSInterface();
            const result = await CQRS.preserveUniqueKey({ 
                key: `${timestamp}@imicros.de`,
                uid: uid2
            });
            expect(result).toEqual(uid);
        })

        it("it should preserve the same key for multiple requests", async () => {
            const uid2 = uuid();
            const CQRS = db.getCQRSInterface();
            let requests = [];
            for (let i=0;i< 100; i++) {
                let single = CQRS.preserveUniqueKey({ 
                    key: `${timestamp}@imicros.de`,
                    uid: uid2
                });
                requests.push(single);
            }
            const result = await Promise.all(requests);
            // console.log(result);
            expect(result[0]).toEqual(uid);
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
    