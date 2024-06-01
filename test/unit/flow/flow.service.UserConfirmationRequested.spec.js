"use strict";
const { ServiceBroker } = require("moleculer");
const { FlowService } = require("../../../index");
const { BusinessRulesService } = require("../../../index");
const { BusinessRulesProvider } = require("../../../index");
const { GroupsProvider } = require("../../../index");
const { VaultProvider } = require("../../../index");
const { QueueProvider } = require("../../../index");
const { StoreProvider } = require("../../../lib/provider/store");

// helpers & mocks
const { GroupsServiceMock } = require("../../mocks/groups");
const { QueueServiceMock, queue } = require("../../mocks/queue");
const { VaultServiceMock } = require("../../mocks/vault");
const { StoreServiceMock, put } = require("../../mocks/store");
const { groups } = require("../../helper/shared");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const flowServiceId = process.env.SERVICE_ID_FLOW || uuid();

// called services
const TemplateService = {
    name: "template",
    actions: {
        render: {
            async handler(ctx) {
                this.calls ? this.calls += 1 : this.calls = 1;
                if (this.calls % 2 === 0) throw new Error("Template not found");
                let result = "";
                switch (ctx.params.template) {
                    case "User Confirmation Body en-US":
                        result =  "Please confirm your email address by clicking the link below";
                        break;
                    case "User Confirmation Subject en-US":
                        result = "<p>Click the link below to confirm your email address</p>";
                        break;
                }
                return result;
            }
        }
    }
}

const MailService = {
    name: "smtp",
    actions: {
        send: {
            async handler(ctx) {
                if (ctx.params.account === "my mail account" && ctx.params.message.to === "john.doe@my-company.com") {
                    return { result: { status: "Done", success: { sent: Date.now()} } };
                }
                return { result: { status: "Failed", error: { message: "Invalid account or recipient" } } };
            }
        }
    }
}

describe("Test flow: process UserConfirmationRequested ", () => {
    
        let broker, opts, userId = uuid(), processes = [];
        let xmlData = fs.readFileSync("./assets/UserConfirmationTemplates.dmn").toString();
    
        beforeAll(() => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: groups[0].uid, acl: { ownerId: groups[0].uid } }};
        });
    
        beforeEach(() => {
        });
        
        afterEach(() => {
        });
        
        describe("Test create service", () => {
    
            it("it should start the broker", async () => {
                // broker with retry policy
                broker = new ServiceBroker({
                    logger: console,
                    logLevel: "info", // "info" //"debug"
                    retryPolicy: {
                        enabled: true,
                        retries: 5,
                        delay: 100,
                        maxDelay: 2000,
                        factor: 2,
                        check: err => err // && !!err.retryable
                    }
                });
                broker.createService({
                    name: "flow",
                    mixins: [FlowService,BusinessRulesProvider,StoreProvider,QueueProvider,GroupsProvider,VaultProvider],
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
                [TemplateService, MailService, QueueServiceMock, StoreServiceMock, GroupsServiceMock, VaultServiceMock].map(service => { return broker.createService(service); }); 
                await broker.start();
                expect(broker).toBeDefined();
            });
    
            it("should retrieve accessToken for the service", async () => {
                let result = await broker.call("v1.groups.requestAccessForService", { groupId: groups[0].uid, serviceId: flowServiceId, hash: "not used" }, opts );
                expect(result).toBeDefined();
                expect(result.accessToken).toBeDefined();
                opts.meta.accessToken = result.accessToken;
            });
    
        });

        describe("Test flow service", () => {
            let instanceId;
            let objectId;
            let lastEvent;

            it("should deploy a business rule", async () => {
                let objectName = "path/to/example/UserConfirmationTemplates.dmn";
                let groupId = groups[0].uid;
                put(groupId,objectName, xmlData);
                let result = await broker.call("v1.businessRules.deploy", { objectName }, opts );
                expect(result).toBeDefined();
            });
    
            it("should deploy a process", async () => {
                let objectName = "path/to/example/process.bpmn";
                let groupId = groups[0].uid;
                put(groupId,objectName, fs.readFileSync("./assets/UserConfirmationRequested.bpmn").toString());
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
    
            it("should raise the event UserConfirmationRequested", async () => {
                const params = {
                    name: "User Confirmation Requested",
                    eventId: "UserConfirmationRequested",
                    payload: { 
                        "userId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
                        "email": "john.doe@my-company.com",
                        "locale": "en-US",
                        "confirmationToken": "...signed JSON web token..."
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
    
            it("should process the business rule", async () => {
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
    
            it("should continue the instance", async () => {
                const event = queue["instance"].find(event => event.event === "instance.processed" && event.data.ownerId === groups[0].uid && event.data.version === 2);
                let result = await broker.call("flow.continueInstance", event.data, {} );
                expect(result).toEqual(true);
                expect(queue["instance"][queue["instance"].length-2]).toEqual({ 
                    topic: "instance",
                    key: groups[0].uid + event.data.instanceId,
                    event: "job.created",
                    data: {
                        ownerId: groups[0].uid,
                        instanceId: event.data.instanceId,
                        jobId: expect.any(String)
                    }
                });
                expect(queue["instance"][queue["instance"].length-1]).toEqual({ 
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
    
            it("should get business rule result in the context of the instance", async () => {
                let result = await broker.call("flow.inspect", { instanceId }, opts );
                expect(result).toBeDefined();
                expect(result.context.templates).toEqual({
                    subject: 'User Confirmation Subject en-US',
                    body: 'User Confirmation Body en-US'
                });
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
