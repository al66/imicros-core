
const { Process } = require("../../lib/classes/flow/process");
const { DefaultDatabase } = require("../../lib/classes/flow/basic/database");

const { CreateInstance,
        RaiseEvent,
        CommitJob
      } = require("../../lib/classes/flow/commands/commands");

const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../lib/classes/flow/parser");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const util = require("util");

const broker = new ServiceBroker({
    logger: console,
    logLevel: "debug" // "info" //"debug"
});
const db = new DefaultDatabase();
const parser = new Parser({ logger: broker.logger });
const xmlData = fs.readFileSync("assets/MessagePublishing.bpmn");
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
    await process.execute(new RaiseEvent({ instanceId, eventId: "StartTest", payload: { 
        "orderId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
        "customer": {
            "name": "John Doe",
            "city": "New York",
            "email": "john.doe@my-company.com"
        }
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
        await process.execute(new CommitJob({ jobId: job.jobId, result: true }));
    }
   // await process.execute(new CommitJob({ jobId: jobs[0].jobId, result: { status: "success" } }));
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
        await process.execute(new CommitJob({ jobId: job.jobId, result: true }));
    }
    await process.persist({ owner, accessToken });

    // get log
    const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
    console.log("stored",stored);

}

run();



