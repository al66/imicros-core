const { ServiceBroker } = require("moleculer");
const { DB } = require("../../../lib/db/cassandraExchange");
const { v4: uuid } = require("uuid");
const { createHash } = require('crypto');

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_EXCHANGE || "imicros_exchange"
    } 
}

const hash = (json) => {
    let s = JSON.stringify(json);
    return createHash('sha256').update(s).digest('base64');
}

const messages = [];
for (let i=0; i<10; i++) {
    messages[i] = hash({
        sender: `63c061df-55ec-45fc-813e-b7e81575d033#my-server.de/api/v1/exchange`,
        receiver: `550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange`,
        messageId: uuid()
    });
}

const whitelist = [];
for (let i=0; i<10; i++) {
    whitelist[i] = hash({
        sender: `63c061df-55ec-45fc-813e-b7e81575d033#my-server.de/api/v1/exchange`,
        receiver: `${ uuid() }#dev.imicros.de/api/v1/exchange`
    });
}


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

        it("it should return false for non existing entry", async () => {
            const result = await db.checkWhiteList({ hash: whitelist[0] });
            expect(result).toEqual(false);
        });

        it("it should add a new whitelist entry", async () => {
            const result = await db.addToWhiteList({ hash: whitelist[0] });
            expect(result).toEqual(true);
        });

        it("it should add a second whitelist entry", async () => {
            const result = await db.addToWhiteList({ hash: whitelist[1] });
            expect(result).toEqual(true);
        });

        it("it should return true for an existing entry", async () => {
            const result = await db.checkWhiteList({ hash: whitelist[0] });
            expect(result).toEqual(true);
        });

        it("it should return true for an existing entry", async () => {
            const result = await db.checkWhiteList({ hash: whitelist[1] });
            expect(result).toEqual(true);
        });

        it("it should remove a whitelist entry", async () => {
            const result = await db.removeFromWhiteList({ hash: whitelist[0] });
            expect(result).toEqual(true);
        });

        it("it should return false for non existing entry", async () => {
            const result = await db.checkWhiteList({ hash: whitelist[0] });
            expect(result).toEqual(false);
        });

        it("it should return false for a new message", async () => {
            const result = await db.checkWhiteList({ hash: messages[0] });
            expect(result).toEqual(false);
        });

        it("it should add a message entry", async () => {
            const result = await db.addMessage({ hash: messages[0] });
            expect(result).toEqual(true);
        });

        it("it should return false for a new message", async () => {
            const result = await db.checkForMessage({ hash: messages[1] });
            expect(result).toEqual(false);
        });

        it("it should return true for an existing message", async () => {
            const result = await db.checkForMessage({ hash: messages[0] });
            expect(result).toEqual(true);
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
    