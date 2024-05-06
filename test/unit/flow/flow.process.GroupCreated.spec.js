"use strict";
const { DMNConverter } = require("imicros-feel-interpreter");
const { Process } = require("../../../lib/classes/flow/process");
const { CreateInstance,
        RaiseEvent,
        CommitJob } = require("../../../lib/classes/flow/commands/commands");


// helpers & mocks
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { DefaultDatabase } = require("../../../lib/classes/flow/basic/database");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require('util');
const owner = uuid();
const accessToken = uuid();
const processId = uuid();
const instanceId = uuid();

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


describe("Test flow: process GroupCreated ", () => {

    let broker, db, parsedData, continueVersion;

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
            broker.createService(AnyService);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test process preparation", () => {

        it("it should parse the process", () => {
            // parse process
            const parser = new Parser({ logger: broker.logger });
            const xmlData = fs.readFileSync("assets/GroupCreated.bpmn");
            parsedData = parser.parse({id: uuid(), xmlData, objectName: "Process Example", ownerId: uuid()});

            //console.log("Parsed",util.inspect(parsedData, {showHidden: false, depth: null, colors: true}));
            expect(parsedData).toBeDefined();
        });

        it("it should create a new database instance", async () => {
            db = new DefaultDatabase();
            expect(db).toBeDefined();
        });

    });

    describe("Test process execution", () => {
    
        it("it should raise the event GroupCreated", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            await process.execute(new CreateInstance({ instanceId, processData: parsedData }));
            await process.execute(new RaiseEvent({ instanceId, eventId: "GroupCreated", payload: { 
                "groupId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
                "admin": {
                    "email": "john.doe@my-company.com"
                    //"email": "john.doe@ther.company.com"
                }
            }}));
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            const version = process.getVersion();
            const jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            const processAttributes = await process.getProcess();
            expect(processAttributes.processId).toBe(parsedData.process.id);
            expect(processAttributes.versionId).toBe(parsedData.version.id);
            // console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: 1, colors: true}));
            // console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            // console.log("Stored",util.inspect(stored, {showHidden: false, depth: 1, colors: true}));
            expect(version).toBe(0);
            expect(jobs.length === 1).toBe(true);
            expect(throwing.length === 0).toBe(true);
            expect(stored.version).toBe(1);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
        });

        it("it should commit the jobs", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            let jobs = await process.getJobs({ version: continueVersion });
            for (const job of jobs) {
                const service = job.taskDefinition?.type;
                if (service) {
                    try {
                        const result = await broker.call(service, job.data, { retries: job.taskDefinition?.retries || 0 });
                        const jobId = job.jobId || null;
                        await process.execute(new CommitJob({ jobId, result }));
                    } catch (err) {
                        broker.logger.error("Error",err);
                    }
                }
            }
            await process.persist({ owner, accessToken });

            const version = process.getVersion();
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            //console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: 1, colors: true}));
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: 10, colors: true}));
            expect(version).toBe(1);
            expect(jobs.length === 0).toBe(true);
            expect(throwing.length === 1).toBe(true);
            expect(throwing).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        eventId: "GroupCreationCompleted",
                        payload:{
                            groupId: "0969cfa5-f658-44ba-a429-c2cd04bef375",
                            someStuff: true
                        }
                    })
                ])
            );
            expect(stored.version).toBe(2);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
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