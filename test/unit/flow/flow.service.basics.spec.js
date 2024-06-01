"use strict";

const { ServiceBroker } = require("moleculer");
const { FlowService } = require("../../../index");
const { BusinessRulesService } = require("../../../index");
const { BusinessRulesProvider } = require("../../../index");
const { StoreProvider } = require("../../../lib/provider/store");
const { GroupsProvider } = require("../../../lib/provider/groups");
const { VaultProvider } = require("../../../lib/provider/vault");
const { QueueProvider } = require("../../../lib/provider/queue");

// helper & mocks
const { StoreServiceMock, put } = require("../../mocks/store");
const { QueueServiceMock, queue } = require("../../mocks/queue");
const { groups } = require("../../helper/shared");
const { GroupsServiceMock } = require("../../mocks/groups");
const { VaultServiceMock } = require("../../mocks/vault");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const flowServiceId = process.env.SERVICE_ID_FLOW || uuid();

// called services
const AnyService = {
    name: "some",
    actions: {
        stuff: {
            async handler(ctx) {
                return true;
            }
        }
    }
}

describe("Test flow service basics", () => {

    let broker, service, opts = {}, userId = uuid(), processes = [];
    
    beforeAll(() => {
        opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: groups[0].uid, acl: { ownerId: groups[0].uid } }};
    });
    
    afterAll(() => {
    });
    
    beforeEach(() => {
    });
    
    afterEach(() => {
    });

    describe("Test create service", () => {

        it("should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            service = broker.createService({ 
                name: "flow",
                mixins: [FlowService, BusinessRulesProvider, QueueProvider, StoreProvider, GroupsProvider, VaultProvider],
                dependencies: ["v1.groups"],
                settings: {
                    db: { 
                        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                        keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow"
                    } 
                }
            });
            broker.createService({
                name: "businessRules",
                version: "v1",
                mixins: [BusinessRulesService,StoreProvider,GroupsProvider,VaultProvider],
                dependencies: ["v1.groups"],
                settings: {
                    db: {
                        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                        keyspace: process.env.CASSANDRA_KEYSPACE_DECISION || "imicros_decision"
                    }
                }
            });
        // Start additional services
            [AnyService, QueueServiceMock, StoreServiceMock, GroupsServiceMock, VaultServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(service).toBeDefined();
        });

        it("should retrieve accessToken for the service", async () => {
            let result = await broker.call("v1.groups.requestAccessForService", { groupId: groups[0].uid, serviceId: flowServiceId, hash: "not used" }, opts );
            expect(result).toBeDefined();
            expect(result.accessToken).toBeDefined();
            opts.meta.accessToken = result.accessToken;
        });

    });

    describe("Test service", () => {
        let instanceId;

        it("should return an empty process list", async () => {
            let result = await broker.call("flow.getProcessList", { }, opts );
            expect(result).toBeDefined();
            expect(result).toEqual([]);
        });

        it("should deploy a process", async () => {
            let objectName = "path/to/example/process.bpmn";
            let groupId = groups[0].uid;
            put(groupId,objectName, fs.readFileSync("./assets/GroupCreated.bpmn").toString());
            let result = await broker.call("flow.deployProcess", { objectName }, opts );
            expect(result).toBeDefined();
            expect(result.processId).toEqual(expect.any(String));
            expect(result.versionId).toEqual(expect.any(String));
            processes.push(result);
            console.log(result);
        });

        it("should return the deployed process", async () => {
            let result = await broker.call("flow.getProcessList", { versions: true }, opts );
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result[0].processId).toEqual(processes[0].processId);
            expect(result[0].objectName).toEqual("path/to/example/process.bpmn");
            expect(result[0].versions[processes[0].versionId]).toEqual(expect.any(Date)); 
        });

        it("should activate a version", async () => {
            const params = {
                processId: processes[0].processId,
                versionId: processes[0].versionId
            };
            let result = await broker.call("flow.activateVersion", params, opts );
            expect(result).toEqual(true);
        });

        it("should return the deployed process with activated version", async () => {
            let result = await broker.call("flow.getProcessList", { versions: true }, opts );
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result[0].processId).toEqual(processes[0].processId);
            expect(result[0].objectName).toEqual("path/to/example/process.bpmn");
            expect(result[0].versionId).toEqual(processes[0].versionId);
            expect(result[0].activatedAt).toEqual(expect.any(Date));
            expect(result[0].versions[processes[0].versionId]).toEqual(expect.any(Date)); 
        });

        it("should return the deployed process version", async () => {
            const params = { processId: processes[0].processId, versionId: processes[0].versionId, xml: true };
            let result = await broker.call("flow.getProcess", params, opts );
            expect(result).toBeDefined();
            expect(result.processId).toEqual(processes[0].processId);
            expect(result.versionId).toEqual(processes[0].versionId);
            expect(result.created).toEqual(expect.any(Date));
            expect(result.parsedData).toBeDefined();  
            expect(result.parsedData.process.objectName).toEqual("path/to/example/process.bpmn");
            expect(result.xmlData).toBeDefined();
        });

        it("should raise the event GroupCreated", async () => {
            const params = {
                name: "Group created",
                eventId: "GroupCreated",
                payload: { 
                    "groupId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
                    "admin": {
                        "email": "john.doe@my-company.com"
                    }
                 }
            };
            let result = await broker.call("flow.raiseEvent", params, opts );
            expect(result).toBeDefined();
            expect(result.eventId).toEqual(params.eventId);
            expect(result.objectId).toEqual(expect.any(String));
            //console.log(queue["events"]);
            expect(queue["events"]).toContainObject({ 
                topic: "events",
                key: groups[0].uid,
                event: "event.raised",
                data: {
                    ownerId: groups[0].uid,
                    objectId: result.objectId
                }
            });
        });

        it("should assign the raised event", async () => {
            const event = queue["events"].find(event => event.event === "event.raised" && event.data.ownerId === groups[0].uid);
            let result = await broker.call("flow.assignEvent", event.data, {} );
            expect(result).toEqual(true);
            expect(queue["events"]).toContainObject({ 
                topic: "events",
                key: groups[0].uid,
                event: "instance.requested",
                data: {
                    ownerId: groups[0].uid,
                    processId: processes[0].processId,
                    versionId: processes[0].versionId,
                    instanceId: expect.any(String),
                    objectId: event.data.objectId,
                    origin: "event.raised"
                }
            });
        });

        it("should create a new instance", async () => {
            const event = queue["events"].find(event => event.event === "instance.requested" && event.data.ownerId === groups[0].uid);
            let result = await broker.call("flow.createInstance", event.data, {} );
            expect(result).toEqual(true);
            expect(queue["instance"]).toContainObject({ 
                topic: "instance",
                key: groups[0].uid + event.data.instanceId,
                event: "event.raised",
                data: {
                    ownerId: groups[0].uid,
                    processId: processes[0].processId,
                    versionId: processes[0].versionId,
                    instanceId: event.data.instanceId,
                    objectId: event.data.objectId
                }
            });
            instanceId = event.data.instanceId;
        });

        it("should process the event", async () => {
            const event = queue["instance"].find(event => event.event === "event.raised" && event.data.ownerId === groups[0].uid);
            let result = await broker.call("flow.processEvent", event.data, {} );
            expect(result).toEqual(true);
            expect(queue["instance"]).toContainObject({ 
                topic: "instance",
                key: groups[0].uid + event.data.instanceId,
                event: "instance.processed",
                data: {
                    ownerId: groups[0].uid,
                    instanceId: event.data.instanceId,
                    version: 1
                }
            });
        });

        it("should continue the instance", async () => {
            const event = queue["instance"].find(event => event.event === "instance.processed" && event.data.ownerId === groups[0].uid);
            let result = await broker.call("flow.continueInstance", event.data, {} );
            expect(result).toEqual(true);
            expect(queue["instance"]).toContainObject({ 
                topic: "instance",
                key: groups[0].uid + event.data.instanceId,
                event: "job.created",
                data: {
                    ownerId: groups[0].uid,
                    instanceId: event.data.instanceId,
                    jobId: expect.any(String)
                }
            });
        });

        it("should process the job", async () => {
            const event = queue["instance"].find(event => event.event === "job.created" && event.data.ownerId === groups[0].uid);
            let result = await broker.call("flow.processJob", event.data, {} );
            expect(result).toEqual(true);
            expect(queue["instance"]).toContainObject({
                topic: "instance",
                key: groups[0].uid + event.data.instanceId,
                event: "job.completed",
                data: {
                    ownerId: groups[0].uid,
                    jobId: event.data.jobId,
                    instanceId: event.data.instanceId,
                    resultId: expect.any(String)
                }
            });
        });

        /*
        it ("should commit the job by external worker", async () => {
            const event = queue["instance"].find(event => event.event === "job.created" && event.data.ownerId === groups[0].uid);
            const params = {
                jobId: event.data.jobId,
                result: true
            }
            let result = await broker.call("flow.commitJob", params, opts);
            expect(result).toBeDefined();
            expect(result.jobId).toEqual(event.data.jobId);
            expect(result.objectId).toEqual(expect.any(String));
            expect(queue["instance"]).toContainObject({ 
                topic: "instance",
                key: groups[0].uid + event.data.instanceId,
                event: "job.completed",
                data: {
                    ownerId: groups[0].uid,
                    jobId: event.data.jobId,
                    instanceId: event.data.instanceId,
                    resultId: result.objectId
                }
            });
        });
        */

        it("should process job commit", async () => {
            const event = queue["instance"].find(event => event.event === "job.created" && event.data.ownerId === groups[0].uid);
            const job = queue["instance"].find(event => event.event === "job.completed" && event.data.ownerId === groups[0].uid);
            let result = await broker.call("flow.processCommitJob", job.data, {} );
            expect(result).toEqual(true);
            expect(queue["instance"]).toContainObject({ 
                topic: "instance",
                key: groups[0].uid + event.data.instanceId,
                event: "instance.processed",
                data: {
                    ownerId: groups[0].uid,
                    instanceId: event.data.instanceId,
                    version: 2
                }
            });
        });

        it("should continue the instance throwing the end event", async () => {
            const event = queue["instance"].find(event => event.event === "instance.processed" && event.data.ownerId === groups[0].uid && event.data.version === 2);
            let result = await broker.call("flow.continueInstance", event.data, {} );
            expect(result).toEqual(true);
            expect(queue["events"]).toContainObject({ 
                topic: "events",
                key: groups[0].uid,
                event: "event.raised",
                data: {
                    ownerId: groups[0].uid,
                    objectId: expect.any(String)
                }
            });
            expect(queue["events"].filter(event => event.event === "event.raised" && event.data.ownerId === groups[0].uid).length).toBe(2);
        });

        it("should get the raised end event", async () => { 
            const events = queue["events"].filter(event => event.event === "event.raised" && event.data.ownerId === groups[0].uid);
            const event = events[events.length-1];
            let result = await broker.call("flow.getObject", { objectId: event.data.objectId }, opts );
            expect(result).toBeDefined();
            expect(result.eventId).toEqual("GroupCreationCompleted");
            expect(result.payload).toEqual({
                groupId: "0969cfa5-f658-44ba-a429-c2cd04bef375",
                someStuff: true
            });
            expect(queue["instance"]).toContainObject({ 
                topic: "instance",
                key: groups[0].uid + instanceId,
                event: "instance.completed",
                data: {
                    ownerId: groups[0].uid,
                    processId: processes[0].processId,
                    versionId: processes[0].versionId,
                    instanceId: instanceId
                }
            });
        });

        it("should deactivate a version", async () => {
            const params = {
                processId: processes[0].processId,
                versionId: processes[0].versionId
            };
            let result = await broker.call("flow.deactivateVersion", params, opts );
            expect(result).toEqual(true);
        });

        it("should return the deployed process w/o active version", async () => {
            let result = await broker.call("flow.getProcessList", { versions: true }, opts );
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result[0].processId).toEqual(processes[0].processId);
            expect(result[0].objectName).toEqual("path/to/example/process.bpmn");
            expect(result[0].versionId).toEqual(null);
            expect(result[0].activatedAt).toEqual(null);
            expect(result[0].versions[processes[0].versionId]).toEqual(expect.any(Date)); 
        });



    });

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});