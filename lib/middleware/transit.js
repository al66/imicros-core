/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const crypto = require("crypto");
const { Encryption: EncryptionClass } = require("../util/encryption");
const { v4: uuid } = require("uuid");

module.exports = ({ } = null) => { 

    let logger;
    const keychain = {};
    const base = crypto.getDiffieHellman('modp14');

    return {
        name: "Test",

        created() {
            logger = this.logger;

            const publicKey = base.generateKeys();
            Object.assign(this.metadata, {
                uuid: uuid(),
                publicKey: base.getPublicKey('base64')
            });
            this.logger.info("Middleware for transit encryption started", { publicKey });
        },

        transporterSend(next) {
            return async (topic, data, meta) => {
                /*
                console.log("TOPIC", topic);
                console.log("META", meta);
                console.log("DATA", data);
                */
                // await logger.info("Send message", { topic, data, meta });
                return next(topic, data, meta);
            }
        },
        transitMessageHandler(next) {
            return (cmd, packet) => {
                // await logger.info("Received message", { cmd, packet });
                if (cmd === "INFO" && packet.payload.sender && packet.payload.metadata && packet.payload.metadata.uuid && keychain[packet.payload.sender]?.uuid !== packet.payload.metadata.uuid) {
                    const publicKey = Buffer.from(packet.payload.metadata.publicKey,"base64");
                    // logger.info("Received metadata", { sender: packet.payload.sender, metadata: packet.payload.metadata });
                    if (!keychain[packet.payload.sender] || !keychain[packet.payload.sender].uuid) {
                        keychain[packet.payload.sender] = {
                            uuid: packet.payload.metadata.uuid
                        }
                        // logger.info("Calculate key", { sender: packet.payload.sender, publicKey });
                        keychain[packet.payload.sender] = {
                            sharedSecret: base.computeSecret(publicKey, "base64")
                        };
                    }
                }
                return next(cmd, packet);
            }
        },
        transporterReceive(next) {
            return async (cmd, data, s) => {
                //console.log("CMD", cmd);
                // console.log("S", s);      -> Socket
                // console.log("DATA", data);
                // await logger.info("Received message", { cmd, data });
                return next(cmd, data, s)
            }
        }
    }
}
