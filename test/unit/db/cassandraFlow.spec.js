const { ServiceBroker } = require("moleculer");
const { DB } = require("../../../lib/classes/db/cassandraFlow");
const { Parser } = require("../../../lib/classes/flow/parser");
const { VaultServiceAccess } = require("../../../lib/classes/provider/vault");
const { GroupsServiceAccess } = require("../../../lib/classes/provider/groups");
const { v4: uuid } = require("uuid");
const { Constants } = require("../../../lib/classes/util/constants");

// helper & mocks
const { StoreServiceMock, put, get } = require("../../mocks/store");
const { GroupsServiceMock } = require("../../mocks/groups");
const { VaultServiceMock } = require("../../mocks/vault");
const fs = require("fs");
const exp = require("constants");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow"
    } 
}

describe("Test database connection", () => {
    let broker, db, serviceId = uuid(), accessToken, xmlData, parsedData, userId = uuid(), owner = [uuid(),uuid()];
    let processIds = [uuid(),uuid()];
    let timerDay, timerTime;

    beforeAll(() => {
        // time = new Date(Date.now())
        const now = new Date(Date.now());
        timerDay = now.toISOString().substring(0,10);
        timerTime = now.toTimeString().substring(0,8);
    })

    beforeEach(() => {
        opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: owner[0], acl: { ownerId: owner[0] } }};
    });
    
    afterEach(() => {
    });

    describe("Test database initialization", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            [GroupsServiceMock, VaultServiceMock, StoreServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(broker).toBeDefined();
        });

        it("it should initialize the connector and connect to database", async () => {
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

    describe("Test parser class", () => {
        it("it should parse the process", async () => {
            const parser = new Parser({ broker });
            expect(parser).toBeDefined();
            expect(parser instanceof Parser).toEqual(true);
            xmlData = fs.readFileSync("assets/UserConfirmationRequested.bpmn");
            const id = uuid();
            const objectName = "Process Example";
            parsedData = parser.parse({id, xmlData, objectName, ownerId: owner[0]});
            expect(parsedData).toBeDefined();
            expect(parsedData.process.id).toEqual(id);
            expect(parsedData.process.objectName).toEqual(objectName);
        });
    });

    describe("Test database connector", () => {
        let objectIds = [uuid(),uuid()];
        let object = {
            test: "test",
            value: 123,
            date: new Date().toString(),
            now: Date.now(),
            deep: {
                nested: "nested"
            }
        };
        let instanceIds = [uuid()];
        let subscriptionIds = [uuid(),uuid()];

        it("it should preserve a key", async () => {
            const result = await db.preserveUniqueKey({ 
                key: parsedData.process.id,
                uid: processIds[0]
            });
            expect(result).toEqual(processIds[0]);
        })

        it("it should read the key again", async () => {
            const result = await db.getIdByUniqueKey({ 
                key: parsedData.process.id
            });
            expect(result).toEqual(processIds[0]);
        })

        it("it should fail to preserve the key again", async () => {
            const uid2 = uuid();
            const result = await db.preserveUniqueKey({ 
                key: parsedData.process.id,
                uid: uid2
            });
            expect(result).toEqual(processIds[0]);
        })

        it("it should preserve the same key for multiple requests", async () => {
            const timestamp = Date.now();
            let requests = [];
            for (let i=0;i< 100; i++) {
                let single = db.preserveUniqueKey({ 
                    key: `${timestamp}@imicros.de`,
                    uid: uuid()
                });
                requests.push(single);
            }
            const result = await Promise.all(requests);
            // console.log(result);
            for (let i=0;i< 100; i++) {
                expect(result[i]).toEqual(result[0]);
            }
        })

        it("it should deploy a process", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
                xmlData: xmlData.toString(), 
                parsedData, 
                attributes: {
                    name: parsedData.process.name,
                    version: parsedData.version.name,
                    created: parsedData.version.created
                }
            };
            return db.saveProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    processId: parsedData.process.id,
                    versionId: parsedData.version.id
                });
            });
            
        });

        it("it should retrieve the process again", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
            };
            return db.getProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res.parsedData).toEqual(parsedData);
            });
            
        });

        it("it should retrieve the xml of the process", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
                xml: true
            };
            return db.getProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res.xmlData).toEqual(xmlData.toString());
            });
            
        });

        it("it should retrieve the process list", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                versions: true
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versions[parsedData.version.id]).toEqual(expect.any(Date));
                expect(res[0].name).toEqual(parsedData.process.name);
                expect(res[0].activeInstances).toEqual([]);
            });
            
        });

        it("it should retrieve the process list with a given process Id", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                processId: parsedData.process.id,
                versions: true
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versions[parsedData.version.id]).toEqual(expect.any(Date));
                expect(res[0].name).toEqual(parsedData.process.name);
                expect(res[0].activeInstances).toEqual([]);
            });
            
        });

        it("it should store an object", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                objectId: objectIds[0], 
                data: object
            };
            return db.saveObject(params).then(res => {
                expect(res).toBeDefined();
                expect(res.objectId).toEqual(params.objectId);
            });
            
        });

        it("it should retrieve an object again", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                objectId: objectIds[0]
            };
            return db.getObject(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(object);
            });
            
        });

        it("it should add a subscription", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                subscriptionId: subscriptionIds[0], 
                type: Constants.SUBSCRIPTION_TYPE_EVENT, 
                hash: "hashed value",
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
            };
            return db.addSubscription(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should add a second subscription from instance", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                subscriptionId: subscriptionIds[1], 
                type: Constants.SUBSCRIPTION_TYPE_EVENT, 
                hash: "hashed value",
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: uuid()
            };
            return db.addSubscription(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should get list of subscriptions", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                type: Constants.SUBSCRIPTION_TYPE_EVENT, 
                hash: "hashed value"
            };
            return db.getSubscriptions(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(2);
                expect(res[0].subscriptionId).toBeDefined();
                expect(res[0].subscription.processId).toEqual(parsedData.process.id);
                expect(res[0].subscription.versionId).toEqual(parsedData.version.id);
            });
        });

        it("it should remove a subscription", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                subscriptionId: subscriptionIds[1], 
                type: Constants.SUBSCRIPTION_TYPE_EVENT, 
                hash: "hashed value"
            };
            return db.removeSubscription(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should get list of subscriptions", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                type: Constants.SUBSCRIPTION_TYPE_EVENT, 
                hash: "hashed value"
            };
            return db.getSubscriptions(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].subscriptionId).toEqual(subscriptionIds[0]);
                expect(res[0].subscription.processId).toEqual(parsedData.process.id);
                expect(res[0].subscription.versionId).toEqual(parsedData.version.id);
            });
        });

        it("it should activate a version", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
                subscriptions: [
                    { subscriptionId: uuid(), type: Constants.SUBSCRIPTION_TYPE_EVENT, hash: "hashed value" },
                    { subscriptionId: uuid(), type: Constants.SUBSCRIPTION_TYPE_MESSAGE, hash: "hashed message id" }
                ]
            };
            return db.activateVersion(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
            
        });

        it("it should retrieve the active version of a given process Id", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                processId: parsedData.process.id
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versionId).toEqual(parsedData.version.id);
                expect(res[0].activeInstances).toEqual([]);
            });
            
        });

        it("it should create an instance", async () => {
            let params = {
                owner: owner[0], 
                instanceId: instanceIds[0],
                processId: parsedData.process.id, 
                versionId: parsedData.version.id
            };
            const res = await db.createInstance(params)
            expect(res).toBeDefined();
            expect(res).toEqual(true);
            
        });

        it("it should retrieve the new instance", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instanceId: instanceIds[0]
            };
            const res = await db.getInstance(params);
            expect(res).toBeDefined();
            expect(res.ownerId).toEqual(owner[0]);
            expect(res.instanceId).toEqual(instanceIds[0]);
            expect(res.processId).toEqual(parsedData.process.id);
            expect(res.versionId).toEqual(parsedData.version.id);
            expect(res.snapshot).toEqual({});
            expect(res.version).toEqual(0);
            
        });

        it("it should save an instance", async () => {
            // await new Promise(resolve => setTimeout(resolve, 200));
            let params = {
                owner: owner[0], 
                accessToken,
                instanceId: instanceIds[0],
                version: 1,
                snapshot: { context: "test" }  
            };
            const res = await db.saveInstance(params)
            expect(res).toBeDefined();
            expect(res).toEqual(true);
        });

        it("it should retrieve the instance with snapshot again", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instanceId: instanceIds[0]
            };
            const res = await db.getInstance(params);
            expect(res).toBeDefined();
            expect(res.ownerId).toEqual(owner[0]);
            expect(res.instanceId).toEqual(instanceIds[0]);
            expect(res.processId).toEqual(parsedData.process.id);
            expect(res.versionId).toEqual(parsedData.version.id);
            expect(res.snapshot).toEqual({ context: "test" });
            expect(res.version).toEqual(1);
            
        });

        it("it should save next version of instance", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instanceId: instanceIds[0],
                version: 2,
                snapshot: { context: { a: "test", b: 123 } }  
            };
            const res = await db.saveInstance(params);
            expect(res).toBeDefined();
            expect(res).toEqual(true);
        });

        it("it sould add a timer", async () => {
            const opts = { acl: { accessToken } };
            const timerEncrypted = await broker.call("v1.groups.encrypt", { data: { timer: "timer" } }, opts);
            const subscriptionEncrypted = await broker.call("v1.groups.encrypt", { data: { subscription: "subscription" } }, opts);
            let params = {
                day: timerDay,
                time: timerTime,
                partition: 0,
                id: uuid(),
                owner: owner[0], 
                timer: timerEncrypted,
                start: true,
                subscription: subscriptionEncrypted
            };
            const res = await db.addTimer(params)
            expect(res).toBeDefined();
            expect(res).toEqual(true);
        });

        it("it should retrieve the updated instance", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instanceId: instanceIds[0]
            };
            const res = await db.getInstance(params)
            expect(res).toBeDefined();
            expect(res.ownerId).toEqual(owner[0]);
            expect(res.instanceId).toEqual(instanceIds[0]);
            expect(res.processId).toEqual(parsedData.process.id);
            expect(res.versionId).toEqual(parsedData.version.id);
            expect(res.snapshot).toEqual({ context: { a: "test", b: 123 } });
            expect(res.version).toEqual(2);
        });

        it("it should retrieve the active version list for the owner", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instances: true
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versionId).toEqual(parsedData.version.id);
                expect(res[0].activeInstances).toEqual(expect.arrayContaining([{
                    instanceId: instanceIds[0],
                    versionId: parsedData.version.id
                }]));
            });
            
        });

        it("it should finish an instance", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instanceId: instanceIds[0],
                version: 2,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                completed: true,
                snapshot: { context: { a: "test", b: 123 } }
            };
            const res = await db.finishInstance(params)
            expect(res).toBeDefined();
            expect(res).toEqual(true);
        });

        it("it should retrieve the finished instance", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                day: new Date().toISOString().substring(0,10),
                instanceId: instanceIds[0]
            };
            const res = await db.getFinishedInstance(params)
            expect(res).toBeDefined();
            expect(res.ownerId).toEqual(owner[0]);
            expect(res.instanceId).toEqual(instanceIds[0]);
            expect(res.processId).toEqual(parsedData.process.id);
            expect(res.versionId).toEqual(parsedData.version.id);
            expect(res.snapshot).toEqual({ context: { a: "test", b: 123 } });
            expect(res.version).toEqual(2);
            expect(res.completed).toEqual(true);
        });

        it("it should retrieve the active version list w/o the finished instance", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                instances: true
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versionId).toEqual(parsedData.version.id);
                expect(res[0].activeInstances).toEqual([]);
            });
            
        });

        it("it should retrieve the list of finished instances", async () => {
            let params = {
                owner: owner[0], 
                accessToken,
                day: new Date().toISOString().substring(0,10)
            };
            const res = await db.getFinishedInstancesList(params)
            expect(res).toBeDefined();
            expect(res.length).toEqual(1);
            expect(res[0].instanceId).toEqual(instanceIds[0]);
            expect(res[0].processId).toEqual(parsedData.process.id);
            expect(res[0].versionId).toEqual(parsedData.version.id);
            expect(res[0].version).toEqual(2);
            expect(res[0].completed).toEqual(true);
        });

        it("it should deactivate a version", () => {
            let params = {
                owner: owner[0], 
                processId: parsedData.process.id
            };
            return db.deactivateVersion(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
            
        });

        it("it should retrieve no active version for the given process Id", () => {
            let params = {
                owner: owner[0], 
                accessToken,
                processId: parsedData.process.id
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versionId).toEqual(null);
            });
            
        });

        it("it should retrieve the list of timers", async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            const opts = { meta: { acl: { accessToken }, accessToken }};
            let params = {
                day: timerDay.toString(),
                time: timerTime.toString(),
                partition: 0
            };
            const res = await db.getTimerList(params)
            expect(res).toBeDefined();
            expect(res.length).toEqual(1);
            expect(res[0].day).toEqual(timerDay);
            expect(res[0].time).toEqual(timerTime);
            expect(res[0].start).toEqual(true);
            const timer = await broker.call("v1.groups.decrypt", { encrypted: res[0].timer }, opts);
            expect(timer).toEqual({ timer: "timer"});
            const subscription = await broker.call("v1.groups.decrypt", { encrypted: res[0].subscription }, opts);
            expect(subscription).toEqual({ subscription: "subscription"});
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
    