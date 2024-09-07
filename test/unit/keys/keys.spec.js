"use strict";

const { ServiceBroker } = require("moleculer");
const { KeysService } = require("../../../index");
const { KeysProvider } = require("../../../index");
const { VaultProvider } = require("../../../lib/provider/vault");

// helper & mocks
const { VaultServiceMock } = require("../../mocks/vault");

const timestamp = new Date();
const owner = `testA${timestamp.valueOf()}`;

const TestProvider = {
    name: "test",
    mixins: [KeysProvider, VaultProvider],
    settings: {
        keys: {
            owner
        }
    },
    actions: {
        getKey: {
            params: {
                id: { type: "string", optional: true }
            },
            async handler(ctx) {
                return this.keys.getKey({ id: ctx.params.id });
            }
        }
    }
};

describe("Test keys service", () => {

    let broker, service, keys, firstId;

    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug" // "info" //"debug"
            });
            service = broker.createService(KeysService);
            broker.createService(TestProvider);
            broker.createService(VaultServiceMock);
            await broker.start();
            await broker.waitForServices(["v1.keys","test","v1.vault"]);
            expect(service).toBeDefined();
        });

    });

    describe("Test keys", () => {

        let opts = {}, oldDefaultKey;

        it("should return null, as the key chain is empty ", async () => {
            let params = {
                owner
            };
            return broker.call("v1.keys.readKeys", params, opts).then(res => {
                expect(res).toEqual(null);
            });
                
        });

        it("should add new key", async () => {
            let params = {
                owner
            };
            return broker.call("v1.keys.newKey", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
                
        });

        it("should return the key chain with one key", async () => {
            let params = {
                owner
            };
            return broker.call("v1.keys.readKeys", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.owner).toEqual(params.owner);
                expect(res.keys).toBeDefined();
                expect(res.keys.default).toBeDefined();
                expect(res.keys[ res.keys.default ]).toBeDefined();
                expect(res.keys[ res.keys.default ]).toEqual({
                    key: expect.any(String),
                    iat: expect.any(Number),
                    exp: expect.any(Number)
                });
                oldDefaultKey = res.keys[ res.keys.default ];
                oldDefaultKey.id = res.keys.default;
                firstId = res.keys.default;
            });
                
        });

        it("should add second key", async () => {
            let params = {
                owner
            };
            return broker.call("v1.keys.newKey", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("should return the key chain with two keys", async () => {
            let params = {
                owner
            };
            return broker.call("v1.keys.readKeys", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.owner).toEqual(params.owner);
                expect(res.keys).toBeDefined();
                expect(Object.keys(res.keys).length).toEqual(3);
                expect(res.keys.default).toBeDefined();
                expect(res.keys.default).not.toEqual(oldDefaultKey.id);
                expect(res.keys[ res.keys.default ]).toBeDefined();
                expect(res.keys[ res.keys.default ]).toEqual({
                    key: expect.any(String),
                    iat: expect.any(Number),
                    exp: expect.any(Number)
                });
                //console.log(res);
                keys = res.keys;
            });
                
        });
        
    });

    describe("Test keys provider", () => {
        let opts = {}, oldKey;

        it("should return the default key", async () => {
            let params = { };
            return broker.call("test.getKey", params).then(res => {
                expect(res).toBeDefined();
                console.log(res);
                expect(res).toEqual({
                    id: keys.default,
                    key: expect.any(String)
                });
                expect(res.key).not.toEqual(keys[ keys.default ].key);
                oldKey = res.key;
            });
        });

        it("should return the same key again", async () => {
            let params = { };
            return broker.call("test.getKey", params).then(res => {
                expect(res).toBeDefined();
                expect(res.key).toEqual(oldKey);
            });
        });

        it("should return a key by id", async () => {
            let params = { id: firstId };
            return broker.call("test.getKey", params).then(res => {
                expect(res).toBeDefined();
                expect(res.id).toEqual(firstId);
            });
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