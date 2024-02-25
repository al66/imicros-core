"use strict";

const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { Constants } = require("../../../lib/classes/util/constants");

// helpers
const { v4: uuid } = require("uuid");
const fs = require("fs");
const util = require("util");

describe("Test parser class", () => {
    let broker, parser, owner = [uuid(),uuid()];

    describe("Test create service and instantiation", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            await broker.start();
            parser = new Parser({ broker });
            expect(broker).toBeDefined();
            expect(parser).toBeDefined();
            expect(parser instanceof Parser).toEqual(true);
            expect(parser.broker).toEqual(broker);
            expect(parser.logger).toEqual(broker.logger);
        });

    });

    describe("Test parser class", () => {
        it("it should parse the process", async () => {
            const xmlData = fs.readFileSync("assets/Process Example.bpmn");
            const id = uuid();
            const objectName = "Process Example";
            const parsedData = parser.parse({id, xmlData, objectName, ownerId: owner[0]});
            expect(parsedData).toBeDefined();
            expect(parsedData.process.id).toEqual(id);
            expect(parsedData.process.name).toEqual(objectName);
            console.log(util.inspect(parsedData, { showHidden: false, depth: null, colors: true }));
            expect(parsedData.event.length).toEqual(2);
            expect(parsedData.event).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ position: Constants.START_EVENT, direction: Constants.CATCHING_EVENT }),
                    expect.objectContaining({ position: Constants.END_EVENT, direction: Constants.THROWING_EVENT })
                ])
            );
            expect(parsedData.task.length).toEqual(3);
            expect(parsedData.task).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ type: Constants.BUSINESS_RULE_TASK, name: 'Determine risk class' }),
                    expect.objectContaining({ type: Constants.SERVICE_TASK, name: 'Map to result' }),
                    expect.objectContaining({ type: Constants.SERVICE_TASK, name: 'Update Buiness Partner' })
                ])
            );
        });
    });
});
