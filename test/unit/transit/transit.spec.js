"use strict";

// require("leaked-handles");

const { ServiceBroker } = require("moleculer");
const { Transit } = require("../../../index");
const util = require("util");

const options = {
    db: {
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
        keysTable: "servicekeys"
    }
}

let events = [];
const Listener = {
    name: "Listener",
    version: "v1",
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
        test: {
            acl: {
                before: true
            },
            repeatable: true,
            handler(ctx) {
                this.logger.info("called action",ctx);
            }
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}

expect.extend({
    toContainObject(received, argument) {
  
      const pass = this.equals(received, 
        expect.arrayContaining([
          expect.objectContaining(argument)
        ])
      )
  
      if (pass) {
        return {
          message: () => (`expected ${this.utils.printReceived(received)} not to contain object ${this.utils.printExpected(argument)}`),
          pass: true
        }
      } else {
        return {
          message: () => (`expected ${this.utils.printReceived(received)} to contain object ${this.utils.printExpected(argument)}`),
          pass: false
        }
      }
    }
})
 

describe("Test transit encryption", () => {

    const brokers = [];

    afterAll(async () => {
        await new Promise(resolve => setTimeout(() => resolve(), 500)); // avoid jest open handle error
    });

    it("it should start the brokers with encryption middleware", async () => {
        ["first", "second", "third"].map(nodeID => {
            const broker =  new ServiceBroker({
                nodeID: nodeID,
                //transporter: "TCP",
                transporter: process.env.NATS_TRANSPORTER,
                middlewares: [Transit({ options })],
                logger: console,
                logLevel: "info" // "debug"
            });
            if (nodeID !== "first") broker.createService(Listener);
            brokers.push(broker);
        });        
        // Start broker
        await Promise.all(brokers.map(broker => broker.start()));
        /*
        // Start discoverer manually
        await brokers[1].registry.discoverer.sendLocalNodeInfo("first");
        await brokers[2].registry.discoverer.sendLocalNodeInfo("first");

        await brokers[0].registry.discoverer.discoverNode("second");
        await brokers[0].registry.discoverer.discoverNode("third");
        */
        // 
        await brokers[0].waitForServices("v1.Listener");
        brokers.map(async broker => console.log(util.inspect(await broker.call("$node.services",{ skipInternal: true, withActions: true }), { showHidden: false, depth: null, colors: true })));
        expect(brokers.length).toEqual(3);
    }, 10000);

    it("it should emit an encrypted event", async () => {
        await brokers[0].emit("my event", { any: "paylaod" });
        await sleep(200);
        expect(events.length > 0);
        expect(events).toContainObject({ event: "my event", sender: "first", payload: { any: "paylaod" } });
    })

    it("it should stop the broker", async () => {
        expect.assertions(1);
        await Promise.all(brokers.map(async broker => broker.stop()));
        expect(brokers).toBeDefined();
    });

});
