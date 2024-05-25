"use strict";
const { ServiceBroker } = require("moleculer");
const { FlowService } = require("../../../index");
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
const instance = require("../../../lib/classes/flow/machines/instance");
const flowServiceId = process.env.SERVICE_ID_FLOW || uuid();
let startTime = {
    timer: "R/2024-03-23T13:00:00Z/P7D",
    date: new Date("2024-03-23T13:00:00Z"),
};
startTime = {
    day: startTime.date.toISOString().substring(0,10),
    time: startTime.date.toISOString().substring(11,19),
    value: startTime.date.getTime(),
    ...startTime
};
//console.log("Start time",startTime);


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

describe("Test flow: process TimersBasic ", () => {
    
        let broker, opts, userId = uuid(), processes = [];
    
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
                    mixins: [FlowService,StoreProvider,QueueProvider,GroupsProvider,VaultProvider],
                    dependencies: ["v1.groups"],
                    settings: {
                        db: {
                            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                            keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow"
                        }
                    }
                });
                [AnyService, QueueServiceMock, StoreServiceMock, GroupsServiceMock, VaultServiceMock].map(service => { return broker.createService(service); }); 
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
            const time = Date.now();
            let instanceId;
            let intermediateTimer;
            let objectId;
            let lastEvent;

            it("should deploy a process", async () => {
                let objectName = "path/to/example/process.bpmn";
                let groupId = groups[0].uid;
                put(groupId,objectName, fs.readFileSync("./assets/TimersBasic.bpmn").toString());
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
    
            it("should process clock tick and emit event per timer partition", async () => {
                let result = await broker.call("flow.processTick", { event: "tick", time: startTime.value });
                expect(result).toEqual(true);
                expect(queue["timer"]).toContainObject({ 
                    topic: "timer",
                    key: "0",
                    event: "tick",
                    data: {
                        day: startTime.day,
                        time: startTime.time,
                        value: startTime.value,
                        partition: 0
                    }
                });
            });

            it("should process time event per partition", async () => {
                const event = queue["timer"].find(event => event.event === "tick");
                let result = await broker.call("flow.processTimeEvent", event.data, {} );
                expect(result).toEqual(true);
                expect(queue["timer"]).toContainObject({ 
                    topic: "timer",
                    key: groups[0].uid,
                    event: "timer.reached",
                    data: {
                        ownerId: groups[0].uid, 
                        processId: processes[0].processId,
                        versionId: processes[0].versionId,
                        instanceId: null,
                        timeReached: {
                            day: startTime.day,
                            time: startTime.time,
                            value: startTime.value,
                        },
                        timerId: expect.any(String),
                        timer: expect.any(String)
                    }
                });
            });

            it("should assign the timer event", async () => {
                const event = queue["timer"].find(event => event.event === "timer.reached" && event.data.ownerId === groups[0].uid);
                let result = await broker.call("flow.assignTimerEvent", event.data, {} );
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
                        objectId: event.data.timerId,
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
                const event = queue["instance"].find(event => event.event === "instance.processed" && event.data.ownerId === groups[0].uid && event.data.version === 1);
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

            it("should retrieve the new scheduled start timer", async () => {
                let expectedDate = new Date(startTime.value + 7 * 24 * 60 * 60 * 1000);
                let result = await broker.call("flow.getTimerList",{ from: expectedDate, to: expectedDate }, opts);
                expect(result).toBeDefined();
                expect(result.length).toEqual(1);
                expect(result[0].processId).toEqual(processes[0].processId);
                expect(result[0].versionId).toEqual(processes[0].versionId);
                expect(result[0].instanceId).toEqual(null);
                expect(result[0].timer.payload.timer.type).toEqual("Cycle");
                expect(result[0].timer.payload.timer.expression).toEqual("R/2024-03-23T13:00:00Z/P7D");
                expect(result[0].timer.payload.timer.current).toBeDefined();
                expect(result[0].timer.payload.timer.cycleCount).toEqual(1);
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
                //console.log(queue["instance"]);
            });

            it("should retrieve the new scheduled intermediate timer", async () => {
                let expectedDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
                let result = await broker.call("flow.getTimerList",{ from: expectedDate, to: expectedDate }, opts);
                result = result.filter(timer => timer.instanceId === instanceId);
                expect(result).toBeDefined();
                expect(result.length).toEqual(1);
                expect(result[0].processId).toEqual(processes[0].processId);
                expect(result[0].versionId).toEqual(processes[0].versionId);
                expect(result[0].instanceId).toEqual(instanceId);
                expect(result[0].timer.payload.timer.type).toEqual("Duration");
                expect(result[0].timer.payload.timer.expression).toEqual("P2D");
                intermediateTimer = result[0];
            });

            it("should process clock tick and emit event per timer partition", async () => {
                intermediateTimer.value = new Date(intermediateTimer.day + "T" + intermediateTimer.time + "Z").getTime();
                let result = await broker.call("flow.processTick", { event: "tick", time: intermediateTimer.value });
                expect(result).toEqual(true);
                expect(queue["timer"]).toContainObject({ 
                    topic: "timer",
                    key: "0",
                    event: "tick",
                    data: {
                        day: intermediateTimer.day,
                        time: intermediateTimer.time,
                        value: intermediateTimer.value,
                        partition: 0
                    }
                });
            });

            it("should process time event per partition", async () => {
                const event = queue["timer"].find(event => event.event === "tick" && event.data.value === intermediateTimer.value);
                let result = await broker.call("flow.processTimeEvent", event.data, {} );
                expect(result).toEqual(true);
                expect(queue["timer"]).toContainObject({ 
                    topic: "timer",
                    key: groups[0].uid,
                    event: "timer.reached",
                    data: {
                        ownerId: groups[0].uid, 
                        processId: processes[0].processId,
                        versionId: processes[0].versionId,
                        instanceId: instanceId,
                        timeReached: {
                            day: intermediateTimer.day,
                            time: intermediateTimer.time,
                            value: intermediateTimer.value,
                        },
                        timerId: intermediateTimer.id,
                        timer: expect.any(String)
                    }
                });
            });

            it("should assign the timer event", async () => {
                const event = queue["timer"].find(event => event.event === "timer.reached" && event.data.ownerId === groups[0].uid && event.data.timerId === intermediateTimer.id );
                let result = await broker.call("flow.assignTimerEvent", event.data, {} );
                expect(result).toEqual(true);
                expect(queue["instance"]).toContainObject({ 
                    topic: "instance",
                    key: groups[0].uid,
                    event: "event.raised",
                    data: {
                        ownerId: groups[0].uid,
                        processId: processes[0].processId,
                        versionId: processes[0].versionId,
                        instanceId: instanceId,
                        objectId: intermediateTimer.id
                    }
                });
            });

            it("should process the event", async () => {
                const event = queue["instance"].find(event => event.event === "event.raised" && event.data.ownerId === groups[0].uid && event.data.objectId === intermediateTimer.id);
                let result = await broker.call("flow.processEvent", event.data, {} );
                expect(result).toEqual(true);
                expect(queue["instance"]).toContainObject({ 
                    topic: "instance",
                    key: groups[0].uid + event.data.instanceId,
                    event: "instance.processed",
                    data: {
                        ownerId: groups[0].uid,
                        instanceId: event.data.instanceId,
                        version: 3
                    }
                });
            });

            // TODO add tests for second task and end event

            it("should continue the instance", async () => {
                const event = queue["instance"].find(event => event.event === "instance.processed" && event.data.ownerId === groups[0].uid && event.data.version === 3);
                let result = await broker.call("flow.continueInstance", event.data, {} );
                expect(result).toEqual(true);
                lastEvent = queue["instance"][queue["instance"].length -1];
                expect(lastEvent).toEqual({ 
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
                const event = lastEvent;
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
                const event = lastEvent;
                const job = queue["instance"].find(event => event.event === "job.completed" && event.data.jobId === lastEvent.data.jobId);
                let result = await broker.call("flow.processCommitJob", job.data, {} );
                expect(result).toEqual(true);
                expect(queue["instance"]).toContainObject({ 
                    topic: "instance",
                    key: groups[0].uid + event.data.instanceId,
                    event: "instance.processed",
                    data: {
                        ownerId: groups[0].uid,
                        instanceId: event.data.instanceId,
                        version: 4
                    }
                });
            });
    
            it("should continue the instance", async () => {
                const event = queue["instance"].find(event => event.event === "instance.processed" && event.data.ownerId === groups[0].uid && event.data.version === 4);
                let result = await broker.call("flow.continueInstance", event.data, {} );
                expect(result).toEqual(true);
                //console.log(queue["instance"]);
                expect(queue["instance"]).toContainObject({ 
                    topic: "instance",
                    key: groups[0].uid + event.data.instanceId,
                    event: "instance.completed",
                    data: {
                        ownerId: groups[0].uid,
                        processId: processes[0].processId,
                        versionId: processes[0].versionId,
                        instanceId: event.data.instanceId
                    }
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
