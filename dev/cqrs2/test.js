
const { Process } = require("./flow/process");
const { DefaultDatabase } = require("./basic/database");

const { CreateInstance } = require("./flow/commands/commands");
const { RaiseEvent } = require("./flow/commands/commands");

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
const xmlData = fs.readFileSync("assets/GroupCreated.bpmn");
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
    await process.execute(new RaiseEvent({ instanceId, eventId: "GroupCreated", payload: { 
        "groupId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
        "admin": {
            "email": "john.doe@my-company.com"
            //"email": "john.doe@ther.company.com"
        }
    }}));
    await process.execute(new RaiseEvent({ instanceId, eventId: "GroupCreated", payload: { 
        "groupId": "0969cfa5-f658-44ba-a429-c2cd04bef375", 
        "admin": {
            "email": "john.doe@my-company.com"
            //"email": "john.doe@ther.company.com"
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

    await process.persist({ owner, accessToken });

    // next cycle
    process = new Process({ db, logger: broker.logger });
    await process.load({ owner, accessToken, uid: instanceId });
    jobs = await process.getJobs({ version: 1 });
    console.log("jobs",jobs);
    throwing = await process.getThrowing({ version: 1 });
    console.log("throwing",throwing);

    await process.persist({ owner, accessToken });

    // get log
    const stored = await db.getApp({ owner, accessToken, uid: instanceId, fromBeginning: true });
    console.log("stored",stored);

}

run();



