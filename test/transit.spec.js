"use strict";

const { ServiceBroker } = require("moleculer");
const { Transit } = require("../index");

// const crypto = require("crypto");

// const prime = crypto.generatePrimeSync(20);

let events = [];
const Listener = {
    name: "Listener",
    events: {
        "**"(payload, sender, event, ctx) {
            events.push({
                event,
                sender,
                payload,
                ctx     
            });
            if (!event.startsWith("$")) this.logger.info("Received", { event, sender, payload });
        }
    },
    actions: {
        test(ctx) {
            this.logger.info("called action",ctx);
        }
    }
}

describe("Test transit encryption", () => {

    const brokers = [];

    it("it should start the brokers with encryption middleware", async () => {
        ["first", "second", "third"].map(nodeID => {
            const broker =  new ServiceBroker({
                nodeID: nodeID,
                //transporter: "TCP",
                transporter: "nats://192.168.2.124:30284",
                middlewares: [Transit({ })],
                logger: console,
                logLevel: "info" //"debug"
            });
            // broker.createService(MasterService);
            if (nodeID !== "first") broker.createService(Listener);
            brokers.push(broker);
        });        
        // Start broker
        await Promise.all(brokers.map(broker => broker.start()));
        await brokers[0].waitForServices("Listener");
        // Start discoverer manually
        // await brokers[1].registry.discoverer.sendLocalNodeInfo("first");
        // await brokers[2].registry.discoverer.sendLocalNodeInfo("first");

        // await brokers[0].registry.discoverer.discoverNode("second");
        // await brokers[0].registry.discoverer.discoverNode("third");
        expect(brokers.length).toEqual(3);
    }, 10000);

    it("it should emit an encrypted event", async () => {
        await brokers[0].emit("my event", { any: "paylaod" });
        expect(events.length > 0);
    })

    it("it should stop the broker", async () => {
        expect.assertions(1);
        await Promise.all(brokers.map(async broker => await broker.stop()));
        expect(brokers).toBeDefined();
    });

});
