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
            expect(result.events[0]).toEqual(expect.objectContaining({ event: { type: "any" } }));
            timeuuid = result.events[0].timeuuid;
            expect(result.events[1]).toEqual(expect.objectContaining({ event: { type: "second" } }));
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
            expect(result.events[0]).toEqual(expect.objectContaining({ event: { type: "any" } }));
            expect(result.events[1]).toEqual(expect.objectContaining({ event: { type: "second" } }));
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
            expect(result.events[0]).toEqual(expect.objectContaining({ event: { type: "second" } }));
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
            expect(result.events[0]).toEqual(expect.objectContaining({ event: { type: "second" } }));
            expect(result.events[1]).toEqual(expect.objectContaining({ event: { type: "third" } }));
        });


    });
            
    describe("Test user", () => {
        let id = uuid(), idB = uuid();

        it("it should add a user", async () => {
            const User = db.getUserInterface();
            const result = await User.add({ key, data: { id , password: "hashedPassword", mail: "admin@imicros.de" }});
            expect(result).toEqual(true);
        });

        it("it should fail adding the user again", async () => {
            const User = db.getUserInterface();
            const result = await User.add({ key, data: { id: uuid(), password: "otherPassword" , mail: "admin@imicros.de" }});
            expect(result).toEqual(false);
        });

        it("it should add a second user", async () => {
            const User = db.getUserInterface();
            const result = await User.add({ key: keyB, data: { id: idB , password: "hashedPassword", mail: "member@imicros.de" }});
            expect(result).toEqual(true);
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

        it("it should get a second user", async () => {
            const User = db.getUserInterface();
            const result = await User.get({ key: keyB  });
            expect(result).toBeDefined();
            expect(result.key).toEqual(keyB);
            expect(result.id).toEqual(idB);
            expect(result.password).toEqual("hashedPassword");
            expect(result.mail).toEqual("member@imicros.de");
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
        let groupId = uuid(), ownerId = credentials.ownerId;

        it("it should add a group", async () => {
            // add group
            const Group = db.getGroupInterface();
            let result = await Group.add({ groupId, data: { label: "My group" }});
            expect(result).toEqual(true);
            // add grant
            const Grants = db.getGrantsInterface();
            result = await Grants.add({ groupId, entityId: ownerId, data: { mail: "admin@imicros.de", token: { groupId, ownerId, role: "admin" } }});
            expect(result).toEqual(true);
            // add relation
            const Relation = db.getRelationInterface();
            result = await Relation.add({ key, groupId, data: { label: "My group", role: "admin" }});
            expect(result).toEqual(true);
        });

        it("it should fail adding the group again", async () => {
            const Group = db.getGroupInterface();
            const result = await Group.add({ groupId, ownerId, data: { label: "My group" }});
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

        it("it should get a single grant of a group", async () => {
            const Grants = db.getGrantsInterface();
            const result = await Grants.get({ groupId, entityId: ownerId });
            expect(result).toBeDefined();
            expect(result.mail).toEqual("admin@imicros.de");
            expect(result.token.role).toEqual("admin");
        });

        it("it should update the grant of a group", async () => {
            const Grants = db.getGrantsInterface();
            const result = await Grants.update({ groupId, entityId: ownerId, data: { mail: "user@imicros.de", token: { groupId, ownerId, role: "user" }, confirmed: true }});
            expect(result).toEqual(true);
        });

        it("it should get the grants of a group", async () => {
            const Grants = db.getGrantsInterface();
            const result = await Grants.getAll({ groupId });
            expect(result).toBeDefined();
            expect(result.grants).toBeDefined();
            expect(result.grants[ownerId].mail).toEqual("admin@imicros.de");
            expect(result.grants[ownerId].confirmed).toEqual(true);
            expect(result.grants[ownerId].token.role).toEqual("user");
        });

        it("it should remove a grant", async () => {
            const Grants = db.getGrantsInterface();
            const result = await Grants.remove({ groupId, entityId: ownerId });
            expect(result).toEqual(true);
        });

        it("it should get the grants of a group without the removed", async () => {
            const Grants = db.getGrantsInterface();
            const result = await Grants.getAll({ groupId });
            expect(result).toBeDefined();
            expect(result.grants).toBeDefined();
            expect(result.grants[ownerId]).not.toBeDefined();
        });

        it("it should add an inviation", async () => {
            const Invitation = db.getInvitationInterface();
            const result = await Invitation.add({ groupId, key: keyB, data: { mail: "userB@imicros.de", role: "member" } });
            expect(result).toBeDefined();
            expect(result).toEqual(true);
        });

        it("it should get an inviation", async () => {
            const Invitation = db.getInvitationInterface();
            const result = await Invitation.get({ groupId, key: keyB });
            expect(result).toBeDefined();
            expect(result).toEqual({ mail: "userB@imicros.de", role: "member" });
        });

        it("it should add a second inviation", async () => {
            const Invitation = db.getInvitationInterface();
            const result = await Invitation.add({ groupId, key: keyC, data: { mail: "userC@imicros.de", role: "member" } });
            expect(result).toBeDefined();
            expect(result).toEqual(true);
        });

        it("it should get all invitations", async () => {
            const Invitation = db.getInvitationInterface();
            const result = await Invitation.getAll({ groupId });
            expect(result).toBeDefined();
            expect(result).toContainEqual(expect.objectContaining({ mail: "userB@imicros.de", role: "member" }));
            expect(result).toContainEqual(expect.objectContaining({ mail: "userC@imicros.de", role: "member" }));
        });

        it("it should remove an invitation", async () => {
            const Invitation = db.getInvitationInterface();
            const result = await Invitation.remove({ groupId, key: keyB });
            expect(result).toBeDefined();
            expect(result).toEqual(true);
        });

        it("it should get all invitations without the deleted", async () => {
            const Invitation = db.getInvitationInterface();
            const result = await Invitation.getAll({ groupId });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).not.toContainEqual(expect.objectContaining({ mail: "userB@imicros.de", role: "member" }));
            expect(result).toContainEqual(expect.objectContaining({ mail: "userC@imicros.de", role: "member" }));
        });

        it("it should get a single relation of a entity", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.get({ key, groupId });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(groupId);
            expect(result.label).toEqual("My group");
            expect(result.role).toEqual("admin");
        });

        it("it should update a relation", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.update({ key, groupId , data: { label: "My own group", role: "member" }});
            expect(result).toEqual(true);
        });

        it("it should fail to update a non-existing relation", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.update({ key, groupId: uuid() , data: { label: "My own group", role: "member" }});
            expect(result).toEqual(false);
        });

        it("it should set ttl of a relation", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.setTTL({ key, groupId , ttl: 100 });
            expect(result).toEqual(true);
        });

        it("it should get the updated relation of a entity", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.get({ key, groupId });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(groupId);
            expect(result.label).toEqual("My own group");
            expect(result.role).toEqual("member");
        });


        it("it should get all relations of a entity", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.getAll({ key });
            expect(result).toBeDefined();
            expect(result.key).toEqual(key);
            expect(result.relations).toBeDefined();
            expect(result.relations[groupId].label).toEqual("My own group");
            expect(result.relations[groupId].role).toEqual("member");
        });

        it("it should remove a relation", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.remove({ key, groupId });
            expect(result).toEqual(true);
        });

        it("it should return empty relations of an entity", async () => {
            const Relation = db.getRelationInterface();
            const result = await Relation.getAll({ key });
            expect(result).toBeDefined();
            expect(Object.entries(result.relations).length).toEqual(0);

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
    