"use strict";
const { ServiceBroker } = require("moleculer");
const { Parser } = require("../../../lib/classes/flow/parser");
const { Constants } = require("../../../lib/classes/util/constants");
const { Process } = require("../../../lib/classes/flow/process");

const { v4: uuid } = require("uuid");
const fs = require("fs");
const xmlData = fs.readFileSync("assets/Process A zeebe.bpmn");
const util = require("util");

describe("Test flow: process class ", () => {

    let broker, parsedData, ownerId = uuid();

    beforeAll(() => {
    });
    
    afterAll(async () => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            // Start additional services
            // [StoreServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test process class ", () => {
            
            beforeEach(() => {
            });
    
            it("it should parse the zeebe process", () => {
                const parser = new Parser({ broker });
                const id = uuid();
                const objectName = "Process A zeebe";
                parsedData = parser.parse({ id, xmlData, objectName, ownerId });
                expect(parsedData).toBeDefined();
                expect(parsedData.process.id).toEqual(id);
                expect(parsedData.process.ownerId).toEqual(ownerId);
                expect(parsedData.process.name).toEqual(objectName);
                console.log(util.inspect(parsedData, { showHidden: false, depth: null, colors: true }));
                expect(parsedData.event.length).toEqual(2);
                expect(parsedData.event).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ position: Constants.START_EVENT, direction: Constants.CATCHING_EVENT }),
                        expect.objectContaining({ position: Constants.END_EVENT, direction: Constants.THROWING_EVENT })
                    ])
                );
                expect(parsedData.task.length).toEqual(1);
                expect(parsedData.task).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ type: Constants.USER_TASK, name: 'Do something' }),
                    ])
                );
                expect(parsedData.sequence.length).toEqual(2);
                expect(parsedData.sequence).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ type: Constants.SEQUENCE_STANDARD }),
                    ])
                );
            });
    });

    describe("Test process class ", () => {

        let process;

        beforeEach(() => {
        });

        it("it should instantiate the class", async () => {
            process = new Process({ 
                logger: broker.logger, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
                parsedData, 
                instanceId: null, 
                tokenData: {}, 
                context: {} 
            });              
            expect(process).toBeDefined();
            expect(process instanceof Process).toEqual(true);
            expect(process.logger).toEqual(broker.logger);
        });

        it(("it should processs the token for start event"), async () => {
            const token = {
                ownerId: ownerId,
                processId: parsedData.process.id,
                versionId: parsedData.version.id,
                instanceId: null,
                elementId: parsedData.event[0].id,
                status: Constants.EVENT_ACTIVATED,
                attributes: { 
                    payload: { id: uuid(), timestamp: new Date().toISOString() },
                }
            };
            await process.processToken({ token });
            expect(process.tokenData.persist.consume.length).toEqual(1);
            expect(process.tokenData.persist.consume).toEqual(
                expect.arrayContaining([
                    expect.objectContaining(token)
                ])
            );
            expect(process.tokenData.persist.emit.length).toEqual(1);
            expect(process.tokenData.persist.emit).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        ownerId: token.ownerId,
                        processId: token.processId,
                        versionId: token.versionId,
                        instanceId: process.instanceId,
                        elementId: token.elementId,
                        status: Constants.EVENT_READY,
                        attributes: { 
                            payload: token.attributes.payload,
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