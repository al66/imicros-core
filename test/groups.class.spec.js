"use strict";

const { ServiceBroker } = require("moleculer");
const { Groups } = require("../lib/main/groups");
const { DB } = require("../lib/db/cassandra");
const { Keys } = require("../lib/util/keys");
const { Encryption } = require("../lib/util/encryption");
const { Serializer } = require("../lib/util/serializer");
const { v4: uuid } = require("uuid");

// helper & mocks
const { credentials } = require("./helper/credentials");
const { KeysMock } = require("./helper/keys");
const { UserUnvalidToken } = require("../../imicros-users/lib/util/errors");

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
const user = {
    mail: `admin${timestamp.getTime()}@imicros.de`,
    id: uuid()
}

const userB = {
    mail: `userb${timestamp.getTime()}@imicros.de`,
    id: uuid()
}

const userC = {
    mail: `userc${timestamp.getTime()}@imicros.de`,
    id: uuid()
}

describe("Test class groups", () => {
    let broker, db, keys, encryption, serializer, token, tokenB, tokenC;

    describe("Prepare test", () => {

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

        it("it should sign an auth-token", async () => {
            const result = await db.encryption.sign({ payload: { type: "authToken", user }});
            expect(result).toBeDefined();
            expect(result.token).toBeDefined();
            token = result.token;
            const { payload } = await db.encryption.verify({ token });
            expect(payload).toBeDefined(); 
            expect(payload).toEqual(expect.objectContaining({ user }));
        });

        it("it should sign a second auth-token", async () => {
            const result = await db.encryption.sign({ payload: { type: "authToken", user: userB }});
            expect(result).toBeDefined();
            expect(result.token).toBeDefined();
            tokenB = result.token;
            const { payload } = await db.encryption.verify({ token: tokenB });
            expect(payload).toBeDefined(); 
            expect(payload).toEqual(expect.objectContaining({ user: userB }));
        });

        it("it should sign a third auth-token", async () => {
            const result = await db.encryption.sign({ payload: { type: "authToken", user: userC }});
            expect(result).toBeDefined();
            expect(result.token).toBeDefined();
            tokenC = result.token;
            const { payload } = await db.encryption.verify({ token: tokenC });
            expect(payload).toBeDefined(); 
            expect(payload).toEqual(expect.objectContaining({ user: userC }));
        });

    });

    describe("Test class", () => {
        let groups, group1, group2, invitationToken, requestToken;

        it("it should initiate the class", async () => {
            groups = new Groups({ db, logger: broker.logger });
            expect(groups).toBeDefined();
        });

        it("it should add a group", async () => {
            const result = await groups.add({ authToken: token, label: "my first group"});
            expect(result).toBeDefined();
            expect(result.groupId).toBeDefined();
            expect(result.label).toEqual("my first group");
            expect(result.userId).toEqual(user.id);
            expect(result.role).toEqual("admin");
            group1 = result.groupId;
        });

        it("it should get a group", async () => {
            const result = await groups.get({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.id).toBeDefined();
            expect(result.id).toEqual(group1);
            expect(result.label).toEqual("my first group");
        });

        it("it should add a second group", async () => {
            const result = await groups.add({ authToken: token, label: "my second group"});
            expect(result).toBeDefined();
            expect(result.groupId).toBeDefined();
            expect(result.label).toEqual("my second group");
            expect(result.userId).toEqual(user.id);
            expect(result.role).toEqual("admin");
            group2 = result.groupId;
        });

        it("it should list both groups", async () => {
            const result = await groups.list({ authToken: token });
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual(expect.objectContaining({ label: "my first group", role: "admin" }));
            expect(result).toContainEqual(expect.objectContaining({ label: "my second group", role: "admin" }));
        });

        it("it should get the members of a group", async () => {
            const result = await groups.members({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ id: user.id, mail: user.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
        });

        it("it should invite an user", async () => {
            const result = await groups.invite({ authToken: token, groupId: group1, mail: userB.mail, role: "member" });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.key).toEqual(expect.any(String));
            expect(result.mail).toEqual(userB.mail);
            expect(result.token).toEqual(expect.any(String));
            invitationToken = result.token;
        });

        it("it should get the members of a group including the invited", async () => {
            const result = await groups.members({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual(expect.objectContaining({ id: user.id, mail: user.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
            expect(result).toContainEqual(expect.objectContaining({ key: expect.any(String), mail: userB.mail, invitation: { role: "member", token: expect.any(String) }}));
        });

        it("it should list the group for the invited user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ label: "my first group", invitation: { role: "member", token: expect.any(String) } }));
        });

        it("it should join a group", async () => {
            const result = await groups.join({ authToken: tokenB, invitationToken });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.role).toEqual("member");
        });

        it("it should get the members of a group including the newly joined", async () => {
            const result = await groups.members({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual(expect.objectContaining({ id: user.id, mail: user.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
            expect(result).toContainEqual(expect.objectContaining({ id: userB.id, mail: userB.mail, role: "member", status: "confirmed", key: expect.any(String) }));
        });

        it("it should add an alias", async () => {
            const result = await groups.alias({ authToken: tokenB, groupId: group1, alias:"my alias name for the group" });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.alias).toEqual("my alias name for the group");
        });

        it("it should hide a relation", async () => {
            const result = await groups.hide({ authToken: tokenB, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.hide).toEqual(true);
        });

        it("it should list the group for the joined user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ label: "my first group", role: "member", alias: "my alias name for the group", hide: true }));
        });

        it("it should nominate a member for admin", async () => {
            const result = await groups.nominate({ authToken: token, groupId: group1, userId: userB.id });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.admin).toEqual(user.id);
            expect(result.command).toEqual("nominate");
            expect(result.member).toEqual(userB.id);
            expect(result.mail).toEqual(userB.mail);
        })

        it("it should list the request for the nominated user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ role: "member", request: { command: "nominate", role: "admin", token: expect.any(String) } }));
            requestToken = result[0].request.token;
            expect(requestToken).toEqual(expect.any(String));
        });

        it("it should decline nomination", async () => {
            const result = await groups.decline({ authToken: tokenB, groupId: group1, requestToken });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.command).toEqual("nominate");
        })

        it("it should not list the declined request", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ role: "member", request: null }));
            expect(requestToken).toEqual(expect.any(String));
        });

        it("it should nominate the member for admin again ", async () => {
            const result = await groups.nominate({ authToken: token, groupId: group1, userId: userB.id });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.admin).toEqual(user.id);
            expect(result.command).toEqual("nominate");
            expect(result.member).toEqual(userB.id);
            expect(result.mail).toEqual(userB.mail);
        })

        it("it should list the request for the nominated user again", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ role: "member", request: { command: "nominate", role: "admin", token: expect.any(String) } }));
            requestToken = result[0].request.token;
            expect(requestToken).toEqual(expect.any(String));
        });

        it("it should accept nomination", async () => {
            const result = await groups.accept({ authToken: tokenB, groupId: group1, requestToken });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.command).toEqual("nominate");
        })

        it("it should list the new role for nonimated user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ groupId: group1, role: "admin" }));
        });

        it("it should get the members of a group including the newly nominated", async () => {
            const result = await groups.members({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual(expect.objectContaining({ id: user.id, mail: user.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
            expect(result).toContainEqual(expect.objectContaining({ id: userB.id, mail: userB.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
        });

        it("it should fail to remove an admin", async () => {
            try {
                await groups.remove({ authToken: token, groupId: group1, userId: userB.id });
            } catch (err) {
                expect(err.message).toEqual("Only members can be removed. Admin's must be revoked first.")
            }
        });

        it("it should add revoke request for admin", async () => {
            const result = await groups.revoke({ authToken: token, groupId: group1, userId: userB.id });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.admin).toEqual(user.id);
            expect(result.command).toEqual("revoke");
            expect(result.tte).toEqual(expect.any(Number));
            expect(result.member).toEqual(userB.id);
            expect(result.mail).toEqual(userB.mail);
        })

        it("it should return false for a second call", async () => {
            const result = await groups.revoke({ authToken: token, groupId: group1, userId: userB.id });
            expect(result).toBeDefined();
            expect(result).toEqual(false);
        })

        it("it should list the request for the nominated user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ role: "admin", request: { command: "revoke", tte: expect.any(Number), role: "member", token: expect.any(String) } }));
            requestToken = result[0].request.token;
            expect(requestToken).toEqual(expect.any(String));
        });

        it("it should accept revoke request", async () => {
            const result = await groups.accept({ authToken: tokenB, groupId: group1, requestToken });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.command).toEqual("revoke");
        })

        it("it should list the new role for revoked user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ groupId: group1, role: "member" }));
        });

        it("it should get the members of a group including the newly revoked", async () => {
            const result = await groups.members({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual(expect.objectContaining({ id: user.id, mail: user.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
            expect(result).toContainEqual(expect.objectContaining({ id: userB.id, mail: userB.mail, role: "member", status: "confirmed", key: expect.any(String) }));
        });

        it("it should remove a member from the group", async () => {
            const result = await groups.remove({ authToken: token, groupId: group1, userId: userB.id });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.userId).toEqual(userB.id);
        })

        it("it should list the members of a group without the removed", async () => {
            const result = await groups.members({ authToken: token, groupId: group1 });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ id: user.id, mail: user.mail, role: "admin", status: "confirmed", key: expect.any(String) }));
            expect(result).not.toContainEqual(expect.objectContaining({ id: userB.id, mail: userB.mail, role: "member", status: "confirmed", key: expect.any(String) }));
        });

        it("it should not list the group for the removed user", async () => {
            const result = await groups.list({ authToken: tokenB });
            expect(result).toBeDefined();
            expect(result.length).toEqual(0);
        });

        it("it should invite an user", async () => {
            const result = await groups.invite({ authToken: token, groupId: group1, mail: userC.mail, role: "member" });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.key).toEqual(expect.any(String));
            expect(result.mail).toEqual(userC.mail);
            expect(result.token).toEqual(expect.any(String));
            invitationToken = result.token;
        });

        it("it should list the group for the invited user", async () => {
            const result = await groups.list({ authToken: tokenC });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ label: "my first group", invitation: { role: "member", token: expect.any(String) } }));
        });

        it("it should refuse the inviation", async () => {
            const result = await groups.refuse({ authToken: tokenC, invitationToken });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
        });

        it("it should return an empty list after refuse the invitation", async () => {
            const result = await groups.list({ authToken: tokenC });
            expect(result).toBeDefined();
            expect(result.length).toEqual(0);
        });

        it("it should invite the user again", async () => {
            const result = await groups.invite({ authToken: token, groupId: group1, mail: userC.mail, role: "member" });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.key).toEqual(expect.any(String));
            expect(result.mail).toEqual(userC.mail);
            expect(result.token).toEqual(expect.any(String));
            invitationToken = result.token;
            console.log(result)
        });

        /*
        it("it should list the group for the invited user again", async () => {
            const result = await groups.list({ authToken: tokenC });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ label: "my first group", invitation: { role: "member", token: expect.any(String) } }));
        });

        it("it should univite the user", async () => {
            const result = await groups.uninvite({ authToken: token, groupId: group1, mail: userC.mail });
            expect(result).toBeDefined();
            expect(result.groupId).toEqual(group1);
            expect(result.key).toEqual(expect.any(String));
            expect(result.mail).toEqual(userC.mail);
        });

        it("it should list the group for the invited user without valid invitation", async () => {
            const result = await groups.list({ authToken: tokenC });
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result).toContainEqual(expect.objectContaining({ label: "my first group", invitation: {  } }));
        });
        */
    });

    describe("Clean up", () => {
        it("it should stop the broker", async () => {
            expect.assertions(1);
            await db.disconnect();
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });

})