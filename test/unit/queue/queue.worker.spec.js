"use strict";
const { ServiceBroker } = require("moleculer");
const { Serializer } = require("../../../index");
const { QueueService } = require("../../../index");
const { WorkerService } = require("../../../index");
const { QueueProvider } = require("../../../index");

// helpers & mocks
const kafka = process.env.KAFKA_BROKER || "localhost:9092";
const timestamp = Date.now();
const topic = `test-topic-${timestamp}`;
//const topic = "test-topic";
const { v4: uuid } = require("uuid");
const received = [];
const receivedBatch = [];
const count = 10;
const AnyService = {
    name: "some",
    mixins: [QueueProvider],
    actions: {
        stuff: {
            async handler(ctx) {
                received.push(ctx.params);
                this.logger.info("Handler called with data", { data: ctx.params });
                // forward to next queue
                this.queue.add({ topic: "test-topic", key: uuid(), event: "any.other", data: { from: topic, action: "some.stuff", ...ctx.params }});
                return true;
            }
        },
        otherStuff: {
            async handler(ctx) {
                received.push(ctx.params);
                this.logger.info("Handler called with data", { data: ctx.params });
                receivedBatch.push(ctx.params);
                // forward as batch to next queue
                this.queue.addBatch({ topicMessages: [{ topic: "test-topic", messages: [{ key: uuid(), event: "any.other", data: { from: topic, action: "some.otherStuff", ...ctx.params }}]}]});
                return true;
            }
        }
    }
}

describe("Test queue consumer service", () => {

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
                version: 1,
                mixins: [QueueService, Serializer],
                settings: {
                    brokers: [kafka],
                    allowAutoTopicCreation: true
                }
            });
            broker.createService({ 
                name: "worker",
                version: null,
                mixins: [WorkerService, Serializer],
                settings: {
                    brokers: [kafka],
                    allowAutoTopicCreation: true,
                    topic,
                    fromBeginning: true,
                    handler: [
                        { event: "event.raised", handler: "some.stuff" },
                        { event: "job.created", handler: "some.otherStuff" }
                    ]
                }
            });
            broker.createService(AnyService);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test publisher ", () => {

        it("it should publish a message", async () => {
            const calls = [];
            for (let i = 0; i < count; i++) {
                let params = {
                    topic,
                    key: groupId,
                    event: "event.raised",
                    data: { 
                        index : i, 
                        value: "test message: " + i
                    }
                };
                const result = await broker.call("v1.queue.add", params, opts);
                calls.push(result);
            }
            expect(calls.filter(r => r === true).length).toEqual(count);
        });
        
        it("the worker should process the messages", async () => {
            function waitFor(count) {
                if (received.length === count) {    
                    return true;
                }
                return new Promise((resolve) => setTimeout(resolve, 100))
                    .then(() => Promise.resolve(true)) 
                    .then((res) => waitFor(count));
            }
            await waitFor(count);
            expect(received.length).toEqual(count);
        });

        it("it should publish a batch of messages", async () => {
            const topicMessages = [];
            const messages = [];
            for (let i = 0; i < count; i++) {
                messages.push({ key: groupId, event: "job.created", data: { index: i, value: "test message: " + i } });
            }
            topicMessages.push({ topic, messages });
            const params = { topicMessages };
            const result = await broker.call("v1.queue.addBatch", params, opts);
            expect(result).toEqual(true);
        });
        
        it("the worker should process the batch of messages", async () => {
            function waitFor(count) {
                if (receivedBatch.length === count) {    
                    return true;
                }
                return new Promise((resolve) => setTimeout(resolve, 100))
                    .then(() => Promise.resolve(true)) 
                    .then((res) => waitFor(count));
            }
            await waitFor(count);
            expect(receivedBatch.length).toEqual(count);
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