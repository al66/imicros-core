"use strict";
const { ServiceBroker } = require("moleculer");
const { ClockService } = require("../index");

// ---- KAFKA ----
process.env.KAFKA_BROKER = "192.168.2.124:30088";
process.env.KAFKAJS_NO_PARTITIONER_WARNING = "1";

// helpers & mocks
const topic = "clock";
const kafka = process.env.KAFKA_BROKER || "localhost:9092";
const { v4: uuid } = require("uuid");

async function run () {
    let broker, opts = {}, groupId = uuid();
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
            precision: 10000
        }
    });
    /*
    broker.createService({ 
        name: "clock",
        version: null,
        mixins: [ClockService],
        settings: {
            brokers: [kafka],
            allowAutoTopicCreation: true,
            topic,
            precision: 10000
        }
    });
    */
    await broker.start();
    await new Promise(resolve => setTimeout(resolve, 60000));
    await broker.stop();
}

run();

