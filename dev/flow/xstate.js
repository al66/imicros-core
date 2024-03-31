const { setTimeout } = require("timers/promises");

const { DMNConverter } = require("imicros-feel-interpreter");
const { Process } = require("../../lib/classes/flow/process");

// helpers & mocks
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../lib/classes/flow/parser");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require('util');

// broker with retry policy
const broker = new ServiceBroker({
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

// parse process
const parser = new Parser({ logger: broker.logger });
const xmlData = fs.readFileSync("assets/UserConfirmationRequested.bpmn");
const parsedData = parser.parse({id: uuid(), xmlData, objectName: "Process Example", ownerId: uuid()});

// add embedded business rule
const xmlDataDMN = fs.readFileSync("assets/UserConfirmationTemplates.dmn").toString();
const expression = new DMNConverter().convert({ xml: xmlDataDMN });
parsedData.task.find(task => task.calledDecision?.id === "Determine User Confirmation Templates").calledDecision.expression = expression;

console.log("Parsed",util.inspect(parsedData, {showHidden: false, depth: null, colors: true}));

// called service
const WorkerService = {
    name: "mail",
    actions: {
        send: {
            async handler(ctx) {
                return { result: { status: "Done", success: { sent: Date.now()} } };
            }
        }
    }
}

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

// create instance and start
async function run () {
    broker.createService(WorkerService);
    broker.createService(TemplateService);
    broker.createService(MailService);
    // broker.createService(Service);
    await broker.start();

    
    const process = new Process({ logger: broker.logger  });
    let result = await process.raiseEvent({ 
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
    while (result.snapshot.context.jobs.length > 0) {
        const job = result.snapshot.context.jobs.shift();
        // console.log("Job",util.inspect(job, {showHidden: false, depth: null, colors: true}));
        const service = job.element.taskDefinition?._type;
        if (service) {
            try {
                const jobResult = await broker.call(service, job.data, { retries: 3 });
                const jobId = job.jobId || null;
                result = await process.commitJob({ jobId, result: jobResult, snapshot: result.snapshot });
            } catch (err) {
                broker.logger.error("Error",err);
            }
        }
    }
    broker.logger.debug("Done");
    // show log
    for (const log of result.snapshot.context.log) {
        broker.logger.debug(log.message, log.data);
    }
    // show raised events
    for (const event of result.snapshot.context.events) {
        broker.logger.debug("Raised", event);
    }

    await broker.stop();

}

run();

