"use strict";

const { ServiceBroker } = require("moleculer");
//const { AclMiddleware } = require("imicros-acl");
const { DB } = require("../lib/db/cassandra");
const { v4: uuid } = require("uuid");
const { Keys } = require("../lib/util/keys");
const { Encryption } = require("../lib/util/encryption");
const { Serializer } = require("../lib/util/serializer");

// helper & mocks
const { credentials } = require("./helper/credentials");
const { KeysMock } = require("./helper/keys");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
        userTable: "user"
    },
    services: {
        keys: "v1.keys"
    } 
}

const timestamp = new Date();

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
            broker.createService(KeysMock);
            await broker.start();
            await broker.waitForServices([settings.services.keys]);
            expect(broker).toBeDefined();
        });

    });

    describe("Test database connector", () => {

        it("it should initialize the connector and connect to database", async () => {
            let options = {
                service: {
                    name: credentials.serviceId,
                    token: credentials.authToken
                },
                services: {
                    keys: "v1.keys"
                }
            };
            keys = new Keys({ broker, options});
            serializer = new Serializer();
            encryption = new Encryption({ logger: broker.logger, keys, serializer, options: {} });
            db = new DB({logger: broker.logger, encryption, options: settings.db, services: settings.services});
            await db.connect();
            expect(db instanceof DB).toEqual(true);
        });

    });

    describe("Test user", () => {
        let key = `U${timestamp.valueOf()}`, id = uuid();

        it("it should add a user", async () => {
            const User = db.getUserInterface();
            const result = await User.add({ key, data: { id , password: "hashedPassword", mail: "admin@imicros.de" }});
            expect(result).toEqual(true);
        });

        it("it should fail adding the user again", async () => {
            const User = db.getUserInterface();
            const result = await User.add({ key, data: { id, mail: "admin@imicros.de" }});
            expect(result).toEqual(false);
        });

        it("it should update a user", async () => {
            const User = db.getUserInterface();
            const result = await User.update({ key, data: { locale: "en-US" }});
            expect(result).toEqual(true);
        });

        it("it should update a user", async () => {
            const User = db.getUserInterface();
            const result = await User.update({ key, data: { preferences: { theme: "dark" } }});
            expect(result).toEqual(true);
        });

        it("it should fail updating a non existing  user", async () => {
            const User = db.getUserInterface();
            const result = await User.update({ key:"Wrong key", data: { preferences: { theme: "dark" } }});
            expect(result).toEqual(false);
        });

        it("it should get a user", async () => {
            const User = db.getUserInterface();
            const result = await User.get({ key });
            expect(result).toBeDefined();
            expect(result.key).toEqual(key);
            expect(result.id).toEqual(id);
            expect(result.password).toEqual("hashedPassword");
            expect(result.mail).toEqual("admin@imicros.de");
            expect(result.locale).toEqual("en-US");
            expect(result.preferences).toEqual({ theme: "dark" });
            broker.logger.info("user",result);
        });

        it("it should update the password", async () => {
            const User = db.getUserInterface();
            const result = await User.update({ key, data: { password: "newHashedPassword" }});
            expect(result).toEqual(true);
        });

        it("it should get the updated user", async () => {
            const User = db.getUserInterface();
            const result = await User.get({ key });
            expect(result).toBeDefined();
            expect(result.key).toEqual(key);
            expect(result.id).toEqual(id);
            expect(result.password).toEqual("newHashedPassword");
            expect(result.mail).toEqual("admin@imicros.de");
            expect(result.locale).toEqual("en-US");
            expect(result.preferences).toEqual({ theme: "dark" });
        });

    });

    describe("Test group", () => {
        let groupId = uuid();

        it("it should add a group", async () => {
            const Group = db.getGroupInterface();
            const result = await Group.add({ groupId, data: { label: "My group" }});
            expect(result).toEqual(true);
        });

        it("it should fail adding the group again", async () => {
            const Group = db.getGroupInterface();
            const result = await Group.add({ groupId, data: { label: "My group" }});
            expect(result).toEqual(false);
        });

        it("it should update a group", async () => {
            const Group = db.getGroupInterface();
            const result = await Group.update({ groupId, data: { label: "My first group" }});
            expect(result).toEqual(true);
        });

        it("it should fail updating a non existing group", async () => {
            const Group = db.getGroupInterface();
            const result = await Group.update({ groupId: uuid(), data: { label: "My second group" }});
            expect(result).toEqual(false);
        });

        it("it should get a group", async () => {
            const Group = db.getGroupInterface();
            const result = await Group.get({ groupId });
            expect(result).toBeDefined();
            expect(result.id).toEqual(groupId);
            expect(result.label).toEqual("My first group");
        });

    });

    describe("Test agent", () => {

        let ownerId = credentials.ownerId, agentId = uuid(), secondAgentId = uuid();

        it("it should add a agent", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.add({ ownerId, agentId, data: { label: "My agent" }});
            expect(result).toEqual(true);
        });

        it("it should add a second agent", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.add({ ownerId, agentId: secondAgentId, data: { label: "My second agent" }});
            expect(result).toEqual(true);
        });

        it("it should fail adding the user again", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.add({ ownerId, agentId, data: { label: "My agent" }});
            expect(result).toEqual(false);
        });

        it("it should update an agent", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.update({ ownerId, agentId, data: { label: "My updated agent" }});
            expect(result).toEqual(true);
        });

        it("it should fail updating a non existing agent", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.update({ ownerId, agentId: uuid(), data: { label: "My updated agent" }});
            expect(result).toEqual(false);
        });

        it("it should get an agent", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.get({ ownerId, agentId });
            expect(result).toBeDefined();
            expect(result.id).toEqual(agentId);
            expect(result.label).toEqual("My updated agent");
            broker.logger.info("agent",result);
        });

        it("it should get all agents", async () => {
            const Agent = db.getAgentInterface();
            const result = await Agent.getAll({ ownerId });
            expect(result).toBeDefined();
            broker.logger.info("agents",result);
            expect(result.agents[agentId]).toBeDefined();
            expect(result.agents[agentId].label).toEqual("My updated agent");
            expect(result.agents[secondAgentId]).toBeDefined();
            expect(result.agents[secondAgentId].label).toEqual("My second agent");
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
    