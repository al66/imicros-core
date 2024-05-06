
const { Process } = require("../../lib/classes/flow/process");
const { DefaultDatabase } = require("../../lib/classes/flow/basic/database");

const { CreateInstance,
        RaiseEvent,
        CommitJob
      } = require("../../lib/classes/flow/commands/commands");

const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../lib/classes/flow/parser");
const { Interpreter } = require("imicros-feel-interpreter");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const util = require("util");

const broker = new ServiceBroker({
    logger: console,
    logLevel: "debug" // "info" //"debug"
});
const db = new DefaultDatabase();
const parser = new Parser({ logger: broker.logger });
const interpreter = new Interpreter();
const xmlData = fs.readFileSync("assets/UserConfirmationRequested.bpmn");
const xmlDataDMN = fs.readFileSync("assets/UserConfirmationTemplates.dmn").toString();
const owner = uuid();
const accessToken = uuid();
const processId = uuid();
const instanceId = uuid();
const objectName = "Process Example";
const processData = parser.parse({id: processId, xmlData, objectName, ownerId: uuid()});
console.log(util.inspect(processData, { showHidden: false, depth: null, colors: true }));


async function run () {
    let process = new Process({ db, logger: broker.logger });
    await process.load({ owner, accessToken, uid: instanceId });
    await process.execute(new CreateInstance({ instanceId, processData }));
    await process.execute(new CreateInstance({ instanceId, processData }));
    await process.execute(new RaiseEvent({ instanceId, eventId: "UserConfirmationRequested", payload: { 
        "userId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
        "email": "john.doe@my-company.com",
        "locale": "en-US",
        "confirmationToken": "...signed JSON web token..."
    }}));
    await process.persist({ owner, accessToken });

    // next cycle
    process = new Process({ db, logger: broker.logger });
    await process.load({ owner, accessToken, uid: instanceId });
    let jobs = await process.getJobs({ version: 0 });
    console.log("jobs",jobs);
    let throwing = await process.getThrowing({ version: 0 });
    console.log("throwing",throwing);
    for (let job of jobs) {
        if (job.type === "rule" && job.calledDecision.id === "Determine User Confirmation Templates") {
            const result = interpreter.evaluate({ expression: xmlDataDMN, context: job.data });
            await process.execute(new CommitJob({ jobId: job.jobId, result }));
        } else {
            await process.execute(new CommitJob({ jobId: job.jobId, result: true }));
        }   
    }
    // interpreter.evaluate({ expression: context.element.calledDecision.expression, context: context.data });
    await process.persist({ owner, accessToken });

    // next cycle
    process = new Process({ db, logger: broker.logger });
    await process.load({ owner, accessToken, uid: instanceId });
    jobs = await process.getJobs({ version: 1 });
    console.log("jobs",jobs);
    throwing = await process.getThrowing({ version: 1 });
    console.log("throwing",throwing);
    for (let job of jobs) {
        await process.execute(new CommitJob({ jobId: job.jobId, result: true }));
    }
    await process.persist({ owner, accessToken });

    // next cycle
    process = new Process({ db, logger: broker.logger });
    await process.load({ owner, accessToken, uid: instanceId });
    jobs = await process.getJobs({ version: 2 });
    console.log("jobs",jobs);
    throwing = await process.getThrowing({ version: 2 });
    console.log("throwing",throwing);
    for (let job of jobs) {
        if (job.taskDefintion?.type === "smtp.send") {
            await process.execute(new CommitJob({ jobId: job.jobId, error: { code: "501" } }));
        } else {
            await process.execute(new CommitJob({ jobId: job.jobId, result: true }));
        }
    }
    await process.persist({ owner, accessToken });

    // get log
    const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
    console.log("stored",stored);

}

run();



