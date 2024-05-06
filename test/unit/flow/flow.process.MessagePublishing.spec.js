"use strict";
const { Process } = require("../../../lib/classes/flow/process");
const { CreateInstance,
        RaiseEvent,
        CommitJob } = require("../../../lib/classes/flow/commands/commands");

// helpers & mocks
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { DefaultDatabase } = require("../../../lib/classes/flow/basic/database");
const { Interpreter, DMNConverter } = require("imicros-feel-interpreter");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require('util');
const owner = uuid();
const accessToken = uuid();
const processId = uuid();
const instanceId = uuid();

// called services
const MessageService = {
    name: "message",
    actions: {
        publish: {
            async handler(ctx) {
                this.logger.debug("Message published",ctx.params);
                return true;
            }
        }
    }
}

const ExchangeService = {
    name: "exchange",
    version: "v1",
    actions: {
        sendMessage: {
            visibility: "public",
            acl: "before",
            params: {
                receiver: { type: "string" },
                messageCode: { type: "string", optional: true, default: 0 },
                message: { type: "object" }
            },
            async handler(ctx) {
                this.logger.debug("Message sent",ctx.params);
                return true;
            }
        }
    }
}

describe("Test flow: process MessagePublishing ", () => {

    let broker, db, parsedData, interpreter, expression, continueVersion;

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
            broker.createService(MessageService);
            broker.createService(ExchangeService);
            await broker.start();
            await broker.waitForServices(["v1.exchange"]);
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test process preparation", () => {

        it("it should parse the process", () => {
            // parse process
            const parser = new Parser({ logger: broker.logger });
            const xmlData = fs.readFileSync("assets/MessagePublishing.bpmn");
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
    
        it("it should raise the event StartTest", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            await process.execute(new CreateInstance({ instanceId, processData: parsedData }));
            await process.execute(new RaiseEvent({ instanceId, eventId: "StartTest", payload: { 
                "orderId": "0969cfa5-f658-44ba-a429-c2cd04bef375",
                "customer": {
                    "name": "Test Customer",
                    "exchangeId": "0969cfa5-f658-44ba-a429-c2cd04bef375#imciros.de",
                }
             }}));
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            const jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            // console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: 1, colors: true}));
            // console.log("Stored",util.inspect(stored, {showHidden: false, depth: 1, colors: true}));
            expect(version).toBe(0);
            expect(jobs.length === 2).toBe(true);
            expect(throwing.length === 0).toBe(true);
            expect(stored.version).toBe(1);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
        });

        it("it should commit the jobs of the first cycle", async () => {
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
                        //broker.logger.error("Error",err);
                        await process.execute(new CommitJob({ jobId: job.jobId, error: err }));
                    }
                }
            }
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            // console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: 1, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: null, colors: true}));
            expect(version).toBe(1);
            expect(jobs.length).toBe(2);
            expect(throwing.length).toBe(0);
            expect(stored.version).toBe(2);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
        });

        it("it should commit the jobs of the throwing event cycle", async () => {
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
                        //broker.logger.error("Error",err);
                        await process.execute(new CommitJob({ jobId: job.jobId, error: err }));
                    }
                }
            }
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            //console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: null, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: null, colors: true}));
            expect(version).toBe(2);
            expect(jobs.length).toBe(2);
            expect(throwing.length).toBe(2);
            expect(throwing).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        eventId: "MessageIntermediateThrowingEvent1",
                        payload: {
                            correlationId: '0969cfa5-f658-44ba-a429-c2cd04bef375',
                            message: { source: 'message throwing intermediate event' }
                        }
                    }),
                    expect.objectContaining({
                        eventId: "MessageIntermediateThrowingEvent2",
                        payload: {
                            receiver: '0969cfa5-f658-44ba-a429-c2cd04bef375#imciros.de',
                            messageCode: 'OrderConfirmation',
                            message: {
                              order: {
                                id: '0969cfa5-f658-44ba-a429-c2cd04bef375',
                                customer: {
                                  name: 'Test Customer',
                                  exchangeId: '0969cfa5-f658-44ba-a429-c2cd04bef375#imciros.de'
                                }
                              },
                              status: 'confirmed',
                              by: 'Intermediate Throwing Message Event'
                            }
                          }
                    })
                ])
            );
            expect(stored.version).toBe(3);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
        });

        it("it should commit the jobs of the throwing end events", async () => {
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
                        //broker.logger.error("Error",err);
                        await process.execute(new CommitJob({ jobId: job.jobId, error: err }));
                    }
                }
            }
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            //console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: null, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: null, colors: true}));
            expect(version).toBe(3);
            expect(jobs.length).toBe(0);
            expect(throwing.length).toBe(2);
            expect(throwing).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        eventId: "MessageEndEvent1",
                        payload: {
                            correlationId: '0969cfa5-f658-44ba-a429-c2cd04bef375',
                            message: { source: 'message throwing end event' }
                        }
                    }),
                    expect.objectContaining({
                        eventId: "MessageEndEvent2",
                        payload: {
                            receiver: '0969cfa5-f658-44ba-a429-c2cd04bef375#imciros.de',
                            messageCode: 'OrderConfirmation',
                            message: {
                              order: {
                                id: '0969cfa5-f658-44ba-a429-c2cd04bef375',
                                customer: {
                                  name: 'Test Customer',
                                  exchangeId: '0969cfa5-f658-44ba-a429-c2cd04bef375#imciros.de'
                                }
                              },
                              status: 'confirmed',
                              by: 'Throwing Message End Event'
                            }
                          }
                    })
                ])
            );
            expect(stored.version).toBe(4);
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