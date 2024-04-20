"use strict";
const { DMNConverter } = require("imicros-feel-interpreter");
const { Process } = require("../../../lib/classes/flow/process");

// helpers & mocks
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require('util');

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

    let broker, parsedData, executionResult;

    beforeEach(() => {
    });
    
    afterEach(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            // broker with retry policy
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug", // "info" //"debug"
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

            console.log("Parsed",util.inspect(parsedData, {showHidden: false, depth: null, colors: true}));
            expect(parsedData).toBeDefined();
        });

    });

    describe("Test process execution", () => {
    
        it("it should raise the event StartTest", async () => {
            const process = new Process({ logger: broker.logger  });
            executionResult = await process.raiseEvent({ 
                eventName: "StartTest", 
                payload: { 
                    "orderId": "0969cfa5-f658-44ba-a429-c2cd04bef375",
                    "customer": {
                        "name": "Test Customer",
                        "exchangeId": "0969cfa5-f658-44ba-a429-c2cd04bef375#imciros.de",
                    }
                 },
                processData: parsedData,
                snapshot: null,
                instanceId: uuid()
            });
            expect(executionResult).toBeDefined();
            expect(executionResult.snapshot).toBeDefined();
            // expect(executionResult.snapshot.context.jobs.length === 1).toBe(true);
        });

        it("it should commit the jobs", async () => {
            const process = new Process({ logger: broker.logger  });
            while (executionResult.snapshot.context.jobs.length > 0) {
                const job = executionResult.snapshot.context.jobs.shift();
                // console.log("Job",util.inspect(job, {showHidden: false, depth: null, colors: true}));
                const service = job.element.taskDefinition?.type;
                if (service) {
                    try {
                        broker.logger.info("Called service", { service, data: job.data });
                        const jobResult = await broker.call(service, job.data, { retries: 3 });
                        const jobId = job.jobId || null;
                        executionResult = await process.commitJob({ jobId, result: jobResult, snapshot: executionResult.snapshot });
                    } catch (err) {
                        broker.logger.error("Error",err);
                    }
                }
            }
            broker.logger.debug("Done");
            // show log
            for (const log of executionResult.snapshot.context.log) {
                broker.logger.debug(log.message, log.data);
            }
            // show raised events
            for (const event of executionResult.snapshot.context.events) {
                broker.logger.debug("Raised", event);
            }
            // broker.logger.debug("Active", executionResult.snapshot);
            expect(executionResult.snapshot.context.jobs.length === 0).toBe(true);
            expect(executionResult.snapshot.context.events.length === 4).toBe(true);
            expect(executionResult.snapshot.value).toEqual("completed");
            /*
            expect(executionResult.snapshot.context.events).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: "GroupCreationCompleted",
                        payload:{
                            groupId: "0969cfa5-f658-44ba-a429-c2cd04bef375"
                        }
                    })
                ])
            );
            */
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