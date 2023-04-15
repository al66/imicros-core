

const { Kafka, logLevel } = require("kafkajs");

const kafka = new Kafka({
    clientId: "TEST",
    brokers: ["192.168.2.124:30088"],
    logLevel: 5,                        //logLevel.DEBUG,
    ssl: null,     // refer to kafkajs documentation
    sasl: null,   // refer to kafkajs documentation
    connectionTimeout: 1000,
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

const publisher = kafka.producer();
const { v4: uuid } = require("uuid");

const run = async () => {

    await publisher.connect();

    // set topic
    const topic = "test-topic";

    // set key
    const key = uuid();

    // set message content
    let content = {
        event: 'my.event',
        payload: {
            any: "data"
        },
        meta:  {
            any: "meta"
        },
        version: 'v1',
        uid: uuid(),
        timestamp: Date.now()
    };
    
    // Emit event
    try {
        await publisher.send({
            topic: topic,
            messages: [
                    { key: key, value: JSON.stringify(content) }
            ]
        });
    } catch (err) {
        console.error(`Failed to emit event ${content.event} to topic ${topic}`, { content: content, error: err });
        throw err;
    }

    await publisher.disconnect();
}

run().catch(e => console.error(`[simple-consumer] ${e.message}` ));

