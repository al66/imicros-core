"use strict";

const { ServiceBroker } = require("moleculer");
const { DB } = require("../../../lib/classes/db/cassandraKeys");
const { v4: uuid } = require("uuid");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
        keysTable: "servicekeys"
    } 
}

const owners = [uuid(),uuid()];
const ids = [uuid(),uuid(),uuid(),uuid()];
const keys = [uuid(),uuid(),uuid(),uuid()];

describe("Test database connection", () => {
    let broker, db;

    beforeEach(() => { 
        // opts = meta
    })

    describe("Test database initialization", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            await broker.start();
            expect(broker).toBeDefined();
        });

        it("it should initialize the connector and connect to database", async () => {
            db = new DB({logger: broker.logger, options: settings.db });
            await db.connect();
            expect(db instanceof DB).toEqual(true);
        });

    });

    describe("Test database class methods", () => {

        it("it should return null for empty keychain", async () => {
            const result = await db.readKeys({ owner: owners[0] });
            expect(result).toEqual(null);
        });

        it("it should add a new key", async () => {
            const iat = new Date().getTime();
            const params = {
                owner: owners[0], 
                id: ids[0], 
                key: keys[0],
                iat, 
                exp: iat + ( 1000 * 60 * 60 * 24 * 30 ) // add 30 days
            }
            const result = await db.newKey(params);
            expect(result).toEqual(true);
        });

        it("it should return the keychain with the new key", async () => {
            const result = await db.readKeys({ owner: owners[0] });
            expect(result).toBeDefined();
            expect(result.owner).toEqual(owners[0]);
            expect(result.keys.default).toEqual(ids[0]);
            expect(result.keys[ids[0]]).toEqual(expect.objectContaining({ 
                key: keys[0],
                iat: expect.any(Number),
                exp: expect.any(Number)
            }));
        });

        it("it should add a second key", async () => {
            const iat = new Date().getTime();
            const params = {
                owner: owners[0], 
                id: ids[1], 
                key: keys[1],
                iat, 
                exp: iat + ( 1000 * 60 * 60 * 24 * 30 ) // add 30 days
            }
            const result = await db.newKey(params);
            expect(result).toEqual(true);
        });

        it("it should return the keychain with the new key", async () => {
            const result = await db.readKeys({ owner: owners[0] });
            expect(result).toBeDefined();
            expect(result.owner).toEqual(owners[0]);
            expect(result.keys.default).toEqual(ids[1]);
            expect(result.keys[ids[0]]).toEqual(expect.objectContaining({ 
                key: keys[0],
                iat: expect.any(Number),
                exp: expect.any(Number)
            }));
            expect(result.keys[ids[1]]).toEqual(expect.objectContaining({ 
                key: keys[1],
                iat: expect.any(Number),
                exp: expect.any(Number)
            }));
        });

        it("it should add a new key for a second owner", async () => {
            const iat = new Date().getTime();
            const params = {
                owner: owners[1], 
                id: ids[2], 
                key: keys[2],
                iat, 
                exp: iat + ( 1000 * 60 * 60 * 24 * 30 ) // add 30 days
            }
            const result = await db.newKey(params);
            expect(result).toEqual(true);
        });

        it("it should return the keychain of the second owner", async () => {
            const result = await db.readKeys({ owner: owners[1] });
            expect(result).toBeDefined();
            expect(result.owner).toEqual(owners[1]);
            expect(result.keys.default).toEqual(ids[2]);
            expect(result.keys[ids[2]]).toEqual(expect.objectContaining({ 
                key: keys[2],
                iat: expect.any(Number),
                exp: expect.any(Number)
            }));
        });


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
    