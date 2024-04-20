"use strict";
const { DMNParser, DMNConverter } = require("imicros-feel-interpreter");
const { Process } = require("../../../lib/classes/flow/process");

// helpers & mocks
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require('util');

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

    let broker, parsedData, decisions = [], executionResult;

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
            broker.createService(TemplateService);
            broker.createService(MailService);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test process preparation", () => {

        it("it should parse the process", () => {
            // parse process
            const parser = new Parser({ logger: broker.logger });
            const xmlData = fs.readFileSync("assets/UserConfirmationRequested.bpmn");
            parsedData = parser.parse({id: uuid(), xmlData, objectName: "Process Example", ownerId: uuid()});

            // add embedded business rule
            const xmlDataDMN = fs.readFileSync("assets/UserConfirmationTemplates.dmn").toString();

            const parsedExpression = new DMNParser().parse(xmlDataDMN);
            console.log("Parsed Expression",util.inspect(parsedExpression, {showHidden: false, depth: null, colors: true}));
            const expression = new DMNConverter().convert({ xml: xmlDataDMN });
            console.log("Converted Expression",util.inspect(expression, {showHidden: false, depth: null, colors: true}));
            decisions.push({ id: parsedExpression.definitions[0]?.id, name: parsedExpression.definitions[0]?.name, expression });

            decisions.forEach(decision => {
                parsedData.task.find(task => task.calledDecision?.id === decision.id || decision.name).calledDecision.expression = decision.expression;
            });

            console.log("Parsed",util.inspect(parsedData, {showHidden: false, depth: null, colors: true}));
            expect(parsedData).toBeDefined();
            expect(decisions.length).toEqual(1);
        });

    });

    describe("Test process execution", () => {
    
        it("it should raise the event UserConfirmationRequested", async () => {
            const process = new Process({ logger: broker.logger  });
            executionResult = await process.raiseEvent({ 
                eventName: "UserConfirmationRequested", 
                payload: { 
                    "userId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
                    "email": "john.doe@my-company.com",
                    "locale": "en-US",
                    "confirmationToken": "...signed JSON web token..."
                 },
                processData: parsedData,
                snapshot: null,
                instanceId: uuid()
            });
            expect(executionResult).toBeDefined();
            expect(executionResult.snapshot).toBeDefined();
            expect(executionResult.snapshot.context.jobs.length > 0).toBe(true);
        });

        it("it should commit the jobs", async () => {
            const process = new Process({ logger: broker.logger  });
            while (executionResult.snapshot.context.jobs.length > 0) {
                const job = executionResult.snapshot.context.jobs.shift();
                // console.log("Job",util.inspect(job, {showHidden: false, depth: null, colors: true}));
                const service = job.element.taskDefinition?.type;
                if (service) {
                    try {
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
            expect(executionResult.snapshot.context.jobs.length === 0).toBe(true);
            expect(executionResult.snapshot.context.events.length).toEqual(1);
            expect(executionResult.snapshot.value).toEqual("completed");
            expect(executionResult.snapshot.context.events).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: "UserConfirmationSent",
                        payload:{
                            to: "john.doe@my-company.com"
                        }
                    })
                ])
            );
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