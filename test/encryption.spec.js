"use strict";

const { ServiceBroker } = require("moleculer");
const { Encryption } = require("../lib/util/encryption");
const { Serializer } = require("../lib/util/serializer");

// helper & mocks
const { keysMock } = require("./helper/keys");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const { pipeline } = require('node:stream/promises');

describe("Test encryption class", () => {
    let broker, opts, keys, encryption, serializer, owner = [uuid(),uuid()];

    describe("Test create service and instantiation", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            await broker.start();
            serializer = new Serializer();
            const options = {};
            encryption = new Encryption({ logger: broker.logger, keys: keysMock, serializer, options });
            expect(encryption).toBeDefined();
            expect(broker).toBeDefined();
        });

    });

    describe("Test encryption class", () => {
        it("it should encrypt and decrypt an object", async () => {
            keysMock.addKey({ owner: owner[0] });
            const obj = {
                any: "content",
                tobe: "encrypted"
            };
            const encrypted = await encryption.encryptData(obj, owner[0]); 
            expect(encrypted).toBeDefined();
            keysMock.addKey({ owner: owner[0] });
            broker.logger.info("Encrypted value", encrypted);
            const decrypted = await encryption.decryptData(encrypted, owner[0]); 
            expect(decrypted).toBeDefined();
            expect(decrypted).toEqual(obj);
        });

        it("it should encrypt end decrypt an array in time", async () => {
            let load = [];
            for (let i = 0; i < 1000; i++) { load.push(uuid()) };
            let encrypted = [];
            for (const data of load) {
                const e = await encryption.encryptData(data, owner[0]);
                encrypted.push(e); 
            }
            expect(encrypted.length).toEqual(1000);
            let decrypted = [];
            for (const data of encrypted) {
                const e = await encryption.decryptData(data, owner[0]); 
                decrypted.push(e); 
            }
            expect(decrypted.length).toEqual(1000);
            expect(decrypted).toEqual(load);
        });

        it("it should encrypt and decrypt a stream", async () => {
            const filePath = "dev/encryption"
            let readStream = fs.createReadStream(`${filePath}.js`);
            let writeStream = fs.createWriteStream(`${filePath}.enc.js`);
            const { cipher } = await encryption.encryptStream(owner[0]);
            const { decipher } = await encryption.decryptStream(owner[0]);
            expect(cipher).toBeDefined();
            expect(decipher).toBeDefined();
            await pipeline(readStream, cipher, writeStream);
            readStream = fs.createReadStream(`${filePath}.enc.js`);
            writeStream = fs.createWriteStream(`${filePath}.dec.js`);
            await pipeline(readStream, decipher, writeStream);
            const original = fs.readFileSync(`${filePath}.js`);
            const decoded = fs.readFileSync(`${filePath}.dec.js`);
            expect(original.equals(decoded)).toEqual(true);
        });

        it("it should sign and verify a token", async () => {
            keysMock.addKey();
            const { token } = await encryption.sign({payload: { foo: "bar" }});
            expect(token).toBeDefined();
            const { payload } = await encryption.verify({ token });
            expect(payload).toBeDefined(); 
            expect(payload).toEqual(expect.objectContaining({ foo: "bar" }));
        })

        it("it should sign and verify a second token", async () => {
            const { token } = await encryption.sign({payload: { bar: "foo" }});
            expect(token).toBeDefined();
            const { payload } = await encryption.verify({ token });
            expect(payload).toBeDefined(); 
            expect(payload).toEqual(expect.objectContaining({ bar: "foo" }));
        })

        it("it should return random string of 64 bytes as hex", () => {
            const random = encryption.randomBytes();
            expect(random).toBeDefined();
            expect(random.length > 64).toEqual(true);
        })

    });

    describe("Test stop broker", () => {
        it("it should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    

});