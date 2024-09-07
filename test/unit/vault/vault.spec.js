"use strict";

// require("leaked-handles");

const { ServiceBroker } = require("moleculer");
const { VaultService: Vault } = require("../../../index");
const { VaultDatabaseProvider } = require("../../../index");

const { setTimeout } = require("timers/promises");

const timestamp = Date.now();
const serviceNameMaster = "master1";
const serviceUnsealed = "Unsealed";

// jest.setTimeout(30000);

process.env.MASTER_TOKEN = "074e48c8e3c0bc19f9e22dd7570037392"; //crypto.randomBytes(32).toString("hex");
process.env.SERVICE_TOKEN = "c1cd91053fca873a4cb7b2549ec1010a"; // crypto.randomBytes(32).toString("hex");

const MasterService = { 
    name: serviceNameMaster,
    mixins: [Vault, VaultDatabaseProvider],
    settings: {
        db: {
            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
            keyspace: process.env.CASSANDRA_KEYSPACE || "imicros_keys" ,
            hashTable: "hashes_test"
        },
        service: {
            unsealed: serviceUnsealed
        },
        expirationDays: 20
    },
    actions:  {
        reset: {
            async handler(ctx) {
                await this.db.reset();
                return true;
            }
        }
    }
};

const expirationDays = 20;
let expired;
global.Date.now = () => { return expired ? timestamp + ( 1000 * 60 * 60 * 24 * ( expirationDays + 1) ) : timestamp ; };

describe("Test master/key service", () => {

    const brokers = [];

    describe("Test vault", () => {
        
        let shares, part, token, hash, signedToken;
        
        it("it should start the brokers with vault service", async () => {
            ["first", "second", "third"].map(nodeID => {
                const broker =  new ServiceBroker({
                    nodeID: nodeID,
                    // transporter: "TCP",
                    transporter: process.env.NATS_TRANSPORTER ||"nats://127.0.0.1:4222",
                    logger: console,
                    logLevel: "info" //"debug"
                });
                broker.createService(MasterService);
                brokers.push(broker);
            });
            // Start broker
            await Promise.all(brokers.map(broker => broker.start()));
            // Ensure services & all brokers are available
            await Promise.all(brokers.map(broker => broker.waitForServices([serviceNameMaster])));
            // Start discoverer manually
            await brokers[1].registry.discoverer.sendLocalNodeInfo("first");
            await brokers[2].registry.discoverer.sendLocalNodeInfo("first");
            await setTimeout(10000);
            const services = await brokers[0].call("$node.services");
            console.log(services);
            expect(brokers.length).toEqual(3);
        }, 20000);

        it("it should init the vault", async () => {
            let params = {
                token: process.env.MASTER_TOKEN
            };
            let res = await brokers[0].call(serviceNameMaster + ".init", params);
            brokers[0].emit("MyEvent", { any: "data" });
            expect(res.shares).toBeDefined();
            expect(res.shares.length).toEqual(5);
            shares = res.shares;
            part = shares.slice(2,5);
        });

        it("it should retrieve token", async () => {
            let params = {
                share: shares[1]
            };
            let res = await brokers[0].call(serviceNameMaster + ".getToken", params);
            expect(res.token).toBeDefined();
            // console.log(res);
            token = res.token;
        });

        it("it should return 3 nodeID's of sealed (getSealed)", async () => {
            let params = {
                token: token
            };
            let res = await brokers[0].call(serviceNameMaster + ".getSealed", params);
            expect(res).toBeDefined();
            expect(res.sealed).toBeDefined();
            expect(res.sealed.length).toBeGreaterThanOrEqual(1);
            expect(res.sealed.length).toEqual(3);
        });

       
        it("it should create a new share", async () => {
            let params = {
                token: process.env.MASTER_TOKEN,
                index: 2,
                shares: part
            };
            let res = await brokers[0].call(serviceNameMaster + ".newShare", params);
            expect(res.share).toBeDefined();
            // console.log(res);
            shares[2] = res.share;
        });

        it("it should commit the first share (unseal)", async () => {
            let params = {
                nodeID: brokers[0].nodeID,
                share: shares[0]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            expect(res.received).toEqual(1);
        });

        it("it should allow double commits (unseal)", async () => {
            let params = {
                nodeID: brokers[0].nodeID,
                share: shares[0]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            expect(res.received).toEqual(1);
        });

        it("it should throw Error: unvalid token (unseal)", async () => {
            let params = {
                nodeID: brokers[0].nodeID,
                share: "wrong share"
            };
            await brokers[0].call(serviceNameMaster + ".unseal", params).catch(err => {
                expect(err instanceof Error).toBe(true);
                expect(err.message).toEqual("Invalid share");
            });
        });

        it("it should commit the second share (unseal)", async () => {
            let params = {
                nodeID: brokers[0].nodeID,
                share: shares[2]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            expect(res.received).toEqual(2);
        });
        
        it("it should throw Error: this method can only be called once", async () => {
            let params = {
                token: process.env.MASTER_TOKEN
            };
            await brokers[0].call(serviceNameMaster + ".init", params).catch(err => {
                expect(err instanceof Error).toBe(true);
                expect(err.message).toEqual("this method can only be called once");
            });
        });

        it("it should unseal the master (unseal)", async () => {
            let params = {
                nodeID: brokers[0].nodeID,
                share: shares[4]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            await brokers[0].waitForServices([serviceUnsealed]);
            expect(res.received).toEqual(3);
        },10000);
        
        it("it should return 2 nodeID's (getSealed)", async () => {
            let params = {
                token: token
            };
            let res = await brokers[0].call(serviceNameMaster + ".getSealed", params);
            expect(res).toBeDefined();
            expect(res.sealed).toBeDefined();
            expect(res.sealed.length).toBeGreaterThanOrEqual(1);
            expect(res.sealed.length).toBeLessThan(3);
            expect(res.sealed.length).toEqual(2);
            //console.log(res);
        });
        
        it("it should commit the first share (unseal)", async () => {
            let params = {
                nodeID: brokers[1].nodeID,
                share: shares[0]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            expect(res.received).toEqual(1);
        });

        it("it should commit the second share (unseal)", async () => {
            let params = {
                nodeID: brokers[1].nodeID,
                share: shares[2]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            expect(res.received).toEqual(2);
        });
        
        it("it should unseal the vault of second node (unseal)", async () => {
            let params = {
                nodeID: brokers[1].nodeID,
                share: shares[4]
            };
            let res = await brokers[0].call(serviceNameMaster + ".unseal", params);
            await brokers[1].waitForServices([serviceUnsealed]).delay(1000);
            expect(res.received).toEqual(3);
        },10000);
        
        it("it should return 1 nodeID (getSealed)", async () => {
            let params = {
                token: token
            };
            let res = await brokers[0].call(serviceNameMaster + ".getSealed", params);
            expect(res).toBeDefined();
            expect(res.sealed).toBeDefined();
            expect(res.sealed.length).toBeGreaterThanOrEqual(1);
            expect(res.sealed.length).toBeLessThan(3);
            expect(res.sealed.length).toEqual(1);
            // console.log(res);
        });

        it("it should again throw Error: master is already unsealed", async () => {
            let params = {
                token: process.env.MASTER_TOKEN
            };
            await brokers[0].call(serviceNameMaster + ".init", params).catch(err => {
                expect(err instanceof Error).toBe(true);
                expect(err.message).toEqual("master is already unsealed");
            });
        });

        it("it should hash the key", async () => {
            let params = {
                key: "test"
            };
            let res = await brokers[0].call(serviceNameMaster + ".hash", params);
            expect(res).toBeDefined();
            hash = res;
        });

        it("it should hash the key with the same result", async () => {
            let params = {
                key: "test"
            };
            let res = await brokers[0].call(serviceNameMaster + ".hash", params);
            expect(res).toBeDefined();
            // expect result to be equal to first hash
            expect(res).toEqual(hash);
        });

        it("it should hash the key for a different owner with different result", async () => {
            let params = {
                key: "test",
                extension: "other"
            };
            let res = await brokers[0].call(serviceNameMaster + ".hash", params);
            expect(res).toBeDefined();
            // expect res not to be equal to first hash
            expect(res).not.toEqual(hash);
        });

        it("it should sign a token", async () => {
            let params = {
                payload: {
                    test: "test",
                    any: {
                        deep: {
                            nested: "value",
                            object: [1,2,3]
                        }
                    }
                },
                extension: "other"
            };
            let res = await brokers[0].call(serviceNameMaster + ".signToken", params);
            expect(res).toBeDefined();
            expect(res.token).toBeDefined();
            signedToken = res.token;
            console.log(signedToken);
        });

        it("it should verify a signed token", async () => {
            let params = {
                token: signedToken
            };
            let res = await brokers[0].call(serviceNameMaster + ".verifyToken", params);
            expect(res).toBeDefined();
            expect(res.payload).toBeDefined();
            expect(res.payload.test).toBeDefined();
            expect(res.payload.any.deep.object).toEqual([1,2,3]);
        });

        it("it should reset the hash table", async () => {
            let res = await brokers[0].call(serviceNameMaster + ".reset");
            expect(res).toBeDefined();
        });

        it("should stop the broker", async () => {
            expect.assertions(1);
            await Promise.all(brokers.map(async broker => await broker.stop()));
            expect(brokers).toBeDefined();
        });

    });

});