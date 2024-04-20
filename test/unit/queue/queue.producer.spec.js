"use strict";
const { ServiceBroker } = require("moleculer");
const { Serializer } = require("../../../index");
const { QueueService } = require("../../../index");

// helpers & mocks
const kafka = process.env.KAFKA_BROKER || "localhost:9092";
//const timestamp = Date.now();
//const topic = `test-topic-${timestamp}`;
const topic = "test-topic";
const { v4: uuid } = require("uuid");

describe("Test queue publisher service", () => {

    let broker, opts = {}, groupId = uuid();

    beforeEach(() => {
    });
    
    afterEach(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService({ 
                name: "queue",
                version: null,
                mixins: [QueueService, Serializer],
                settings: {
                    brokers: [kafka],
                    allowAutoTopicCreation: true
                }
            });
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test publisher ", () => {

        it("it should publish a message", async () => {
            const count = 10;
            const calls = [];
            for (let i = 0; i < count; i++) {
                let params = {
                    topic,
                    key: groupId,
                    event: "instance.created",
                    data: { 
                        index : i, 
                        value: "test message: " + i
                    }
                };
                const result = await broker.call("queue.add", params, opts);
                calls.push(result);
            }
            expect(calls.filter(r => r === true).length).toEqual(count);
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