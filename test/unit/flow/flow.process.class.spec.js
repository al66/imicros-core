const { Process } = require("../../../lib/classes/flow/process");

// helpers & mocks
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require('util');
const { Constants } = require("../../../lib/classes/util/constants");

describe("Test flow: process class ", () => {

    let broker, processData = [];

    beforeEach(() => {
    });
    
    afterEach(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            // broker with retry policy
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" // "info" //"debug"
            });
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test process preparation", () => {

        it("it should parse the process GroupCreated.bpmn", () => {
            // parse process
            const parser = new Parser({ logger: broker.logger });
            const xmlData = fs.readFileSync("assets/GroupCreated.bpmn");
            processData[0]  = parser.parse({id: uuid(), xmlData, objectName: "GroupCreated", ownerId: uuid()});
            // console.log("Parsed",util.inspect(processData[0], {showHidden: false, depth: null, colors: true}));
            expect(processData[0]).toBeDefined();
        });

        it("it should parse the process TimersBasic.bpmn", () => {
            // parse process
            const parser = new Parser({ logger: broker.logger });
            const xmlData = fs.readFileSync("assets/TimersBasic.bpmn");
            processData[1]  = parser.parse({id: uuid(), xmlData, objectName: "TimersBasic", ownerId: uuid()});
            // console.log("Parsed",util.inspect(processData[1], {showHidden: false, depth: null, colors: true}));
            expect(processData[1]).toBeDefined();
        });

    });

    describe("Test process class methods", () => {

        it("it should return the start events of process GroupCreated", () => {
            const process = new Process({ logger: broker.logger  });
            const result = process.getInitialEvents({ processData: processData[0] });
            //console.log(result.subscriptions);
            expect(result.subscriptions).toBeDefined();
            expect(result.subscriptions.length).toEqual(1);
            expect(result.subscriptions[0].subscriptionId).toEqual(expect.any(String));
            expect(result.subscriptions[0].processId).toEqual(processData[0].process.id);
            expect(result.subscriptions[0].versionId).toEqual(processData[0].version.id);
            expect(result.subscriptions[0].type).toEqual(Constants.SUBSCRIPTION_TYPE_EVENT);
            expect(result.subscriptions[0].hash).toEqual(expect.any(String));
            expect(result.subscriptions[0].correlation).toEqual(null);
            expect(result.subscriptions[0].condition).toEqual(null);

        });

        it("it should return the start events of process TimersBasic", () => {
            const process = new Process({ logger: broker.logger  });
            const result = process.getInitialEvents({ processData: processData[1] });
            expect(result.timers).toBeDefined();
            expect(result.timers.length).toEqual(1);
            expect(result.timers[0].timerId).toEqual(expect.any(String));
            expect(result.timers[0].processId).toEqual(processData[1].process.id);
            expect(result.timers[0].versionId).toEqual(processData[1].version.id);
            expect(result.timers[0].timer.type).toEqual(Constants.TIMER_CYCLE);
            expect(result.timers[0].timer.expression).toEqual("R/2024-03-23T13:00:00Z/P7D");
            expect(result.timers[0].timer.current).toEqual(new Date("2024-03-23T13:00:00Z"));
            expect(result.timers[0].timer.cycleCount).toEqual(0);
            expect(result.timers[0].day).toEqual("2024-03-23");
            expect(result.timers[0].time).toEqual("13:00:00");
            expect(result.timers[0].partition).toEqual(0);

        });

    });

});
