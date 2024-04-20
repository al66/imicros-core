"use strict";
const { ServiceBroker } = require("moleculer");
const { ClockService } = require("../../../index");
const { WorkerService } = require("../../../index");
const { Serializer } = require("../../../index");

// helpers & mocks
const kafka = process.env.KAFKA_BROKER || "localhost:9092";
const { v4: uuid } = require("uuid");
const calls = [];
const topic = "clock";

const HelperService = {
    name: "helper",
    actions: {
        test: {
            async handler(ctx) {
                calls.push(ctx.params);
                this.logger.info("Test",ctx.params);
                return ctx.params;
            }
        }
    }
};

describe("Test queue publisher service", () => {

    let broker;

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
                name: "clock",
                version: null,
                mixins: [ClockService],
                settings: {
                    brokers: [kafka],
                    allowAutoTopicCreation: true,
                    topic,
                    precision: 1000,
                    fromBeginning: false,        // only for test reasons, never in production!
                    initWait: 100                // wait only 100ms before init - only for test reasons, never in production!
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
                    groupId: "timer",
                    fromBeginning: true,
                    handler: [
                        { event: "tick", handler: "helper.test" },
                        { default: true, handler: "helper.test" }
                    ]
                }
            });
            broker.createService(HelperService);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test clock ", () => {

        it("it should produce some ticks", async () => {
            await new Promise(resolve => setTimeout(resolve, 4000));
            expect(calls.length >= 3).toEqual(true);
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