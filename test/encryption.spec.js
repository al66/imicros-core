"use strict";

const { ServiceBroker } = require("moleculer");
const { Keys } = require("../lib/util/keys");
const { Encryption } = require("../lib/util/encryption");
const { Serializer } = require("../lib/util/serializer");

// helper & mocks
const { credentials } = require("./helper/credentials");
const { KeysMock, keysMockValues } = require("./helper/keys");


describe("Test encryption class", () => {
    let broker, opts, keys, encryption, serializer;

    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            // broker.createService(ACL);
            broker.createService(KeysMock);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });

    describe("Test mock of keys service", () => {
        it("it should retrieve the current key", async () => {
            let params = {
                service: credentials.serviceId,
                token: credentials.authToken
            };
            return broker.call("v1.keys.getSek", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.id).toEqual(keysMockValues.current);
                expect(res.key).toBeDefined();
            });
        });

        it("it should retrieve the previous key", async () => {
            let params = {
                service: credentials.serviceId,
                token: credentials.authToken,
                id: keysMockValues.previous
            };
            return broker.call("v1.keys.getSek", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.id).toEqual(keysMockValues.previous);
                expect(res.key).toBeDefined();
            });
        });
    });

    describe("Test keys class", () => {
        it("it should instantiate the class", async () => {
            let options = {
                service: {
                    name: credentials.serviceId,
                    token: credentials.authToken
                },
                services: {
                    keys: "v1.keys"
                }
            };
            keys = new Keys({ broker, options});
            expect(keys).toBeDefined();
        });

        it("it should retrieve the current key", async () => {
            const res = await keys.getKey();
            expect(res).toBeDefined();
            expect(res.id).toEqual(keysMockValues.current);
            expect(res.key).toBeDefined();
        });

        it("it should retrieve the previuos key", async () => {
            const res = await keys.getKey({ id: keysMockValues.previous });
            expect(res).toBeDefined();
            expect(res.id).toEqual(keysMockValues.previous);
            expect(res.key).toBeDefined();
        });
    });

    describe("Test encryption class", () => {
        it("it should instantiate the class", async () => {
            serializer = new Serializer();
            const options = {};
            encryption = new Encryption({ logger: broker.logger, keys, serializer, options });
            expect(encryption).toBeDefined();
        });

        it("it should encrypt and decrypt an object", async () => {
            const obj = {
                any: "content",
                tobe: "encrypted"
            };
            const encrypted = await encryption.encryptData(obj); 
            expect(encrypted).toBeDefined();
            broker.logger.info("Encrypted value", encrypted);
            const decrypted = await encryption.decryptData(encrypted); 
            expect(decrypted).toBeDefined();
            expect(decrypted).toEqual(obj);
        });

    });

    describe("Test stop broker", () => {
        it("it should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    

});