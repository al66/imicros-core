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
                    throw new Error("Invalid account or recipient");
                    // return { result: { status: "Done", success: { sent: Date.now()} } };
                }
                return { result: { status: "Failed", error: { message: "Invalid account or recipient" } } };
            }
        }
    }
}

describe("Test flow: process UserConfirmationRequested ", () => {

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

            //console.log("Parsed",util.inspect(parsedData, {showHidden: false, depth: null, colors: true}));
            expect(parsedData).toBeDefined();
        });

        it("it should create a new database instance", async () => {
            db = new DefaultDatabase();
            expect(db).toBeDefined();
        });

        it("it should read the DMN file called in the process and create interpreter", async () => {
            const xmlDataDMN = fs.readFileSync("assets/UserConfirmationTemplates.dmn").toString();
            interpreter = new Interpreter();
            expression = new DMNConverter().convert({ xml: xmlDataDMN })
            expect(xmlDataDMN).toBeDefined();
            expect(interpreter).toBeDefined();
            expect(expression).toBeDefined();
        });


    });

    describe("Test process execution", () => {
    
        it("it should raise the event UserConfirmationRequested", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            await process.execute(new CreateInstance({ instanceId, processData: parsedData }));
            await process.execute(new RaiseEvent({ instanceId, eventId: "UserConfirmationRequested", payload: { 
                "userId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
                "email": "john.doe@my-company.com",
                "locale": "en-US",
                "confirmationToken": "...signed JSON web token..."
            }}));
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            const jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
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

        it("it should commit the business rule task of the first cycle", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            let jobs = await process.getJobs({ version: continueVersion });
            for (const job of jobs) {
                const service = job.taskDefinition?.type;
                const decision = job.calledDecision?.id;
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
                if (decision) {
                    const result = interpreter.evaluate({ expression, context: job.data });
                    const jobId = job.jobId || null;
                    await process.execute(new CommitJob({ jobId, result }));
                }
            }
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            // console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: 1, colors: true}));
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: null, colors: true}));
            expect(version).toBe(1);
            expect(jobs.length).toBe(2);
            expect(throwing.length === 0).toBe(true);
            expect(stored.version).toBe(2);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
        });

        it("it should commit the render tasks", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            let jobs = await process.getJobs({ version: continueVersion });
            for (const job of jobs) {
                const service = job.taskDefinition?.type;
                const decision = job.calledDecision?.id;
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
                if (decision) {
                    const result = interpreter.evaluate({ expression, context: job.data });
                    const jobId = job.jobId || null;
                    await process.execute(new CommitJob({ jobId, result }));
                }
            }
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            // console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: 1, colors: true}));
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: null, colors: true}));
            expect(version).toBe(2);
            expect(jobs.length).toBe(1);
            expect(throwing.length === 0).toBe(true);
            expect(stored.version).toBe(3);
            expect(stored.uid).toBe(instanceId);
            expect(stored.events.length > 1).toBe(true);
        });

        it("it should commit the send task", async () => {
            const process = new Process({ db, logger: broker.logger });
            await process.load({ owner, accessToken, uid: instanceId });
            let jobs = await process.getJobs({ version: continueVersion });
            for (const job of jobs) {
                const service = job.taskDefinition?.type;
                const decision = job.calledDecision?.id;
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
                if (decision) {
                    const result = interpreter.evaluate({ expression, context: job.data });
                    const jobId = job.jobId || null;
                    await process.execute(new CommitJob({ jobId, result }));
                }
            }
            const version = process.getVersion();
            continueVersion = process.getVersion();
            await process.persist({ owner, accessToken });
            jobs = await process.getJobs({ version });
            const throwing = await process.getThrowing({ version });
            const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
            //console.log("Throwing",util.inspect(throwing, {showHidden: false, depth: null, colors: true}));
            //console.log("Jobs",util.inspect(jobs, {showHidden: false, depth: 1, colors: true}));
            //console.log("Stored",util.inspect(stored, {showHidden: false, depth: null, colors: true}));
            expect(version).toBe(3);
            expect(jobs.length).toBe(0);
            expect(throwing.length).toBe(1);
            expect(throwing).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        eventId: "UserConfirmationRequestFailed",
                        payload:{
                            to: "john.doe@my-company.com"
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