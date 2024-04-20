"use strict";
const { ServiceBroker } = require("moleculer");
const { FlowService } = require("../../../index");
const { GroupsProvider } = require("../../../index");
const { VaultProvider } = require("../../../index");
const { QueueProvider } = require("../../../index");
const { StoreProvider } = require("../../../lib/provider/store");

// helpers & mocks
const { GroupsServiceMock } = require("../../mocks/groups");
const { VaultServiceMock } = require("../../mocks/vault");
const { StoreServiceMock, put } = require("../../mocks/store");

describe("Test flow: process TimersBasic ", () => {
    
        let broker;
    
        beforeEach(() => {
        });
        
        afterEach(() => {
        });
        
        describe("Test create service", () => {
    
            it("it should start the broker", async () => {
                // broker with retry policy
                broker = new ServiceBroker({
                    logger: console,
                    logLevel: "debug", // "info" //"debug"
                    retryPolicy: {
                        enabled: true,
                        retries: 5,
                        delay: 100,
                        maxDelay: 2000,
                        factor: 2,
                        check: err => err // && !!err.retryable
                    }
                });
                broker.createService({
                    name: "flow",
                    mixins: [FlowService,StoreProvider,QueueProvider,GroupsProvider,VaultProvider],
                    settings: {
                        db: {
                            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                            keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow"
                        }
                    }
                });
                [StoreServiceMock, GroupsServiceMock, VaultServiceMock].map(service => { return broker.createService(service); }); 
                await broker.start();
                expect(broker).toBeDefined();
            });
    
        });

        describe("Test flow service", () => {
            const time = Date.now();

            /*
            it("it should add a timer event", async () => {
                expect.assertions(1);
                let res = await broker.call("flow.emitTimerEvents",{ time: 1000 });
                expect(res).toBeDefined();
            });
            */

            it("it should emit stored timer events", async () => {
                const result = await broker.call("flow.emitTimerEvents",{ time });
                expect(result).toBeDefined();
                expect(result).toEqual(0);
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
