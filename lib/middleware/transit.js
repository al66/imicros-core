/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { DB } = require("../db/cassandraKeys");
const { Keys: KeysClass } = require("../util/keys");
const { EnvironmentSecret: Vault } = require("../vault/secret");
const { Serializer: Base } = require("../util/serializer");
const { Encryption: EncryptionClass } = require("../util/encryption");

module.exports = ({ options = {} } = null) => { 

    let _broker;

    return {
        name: "Test",

        created(broker) {

            _broker = broker;

            broker._encryption = {}
            broker._encryption.db = new DB({ logger: broker.logger, options: options.db || {} });
            broker._encryption.keys = new KeysClass({ broker, logger: broker.logger, db: broker._encryption.db, vault: new Vault({ broker, logger: broker.logger }) });
            broker._encryption.serializer = new Base();
            broker.encryption = new EncryptionClass({ 
                logger: broker.logger,
                keys: broker._encryption.keys,
                serializer: broker._encryption.serializer, 
                options: {} 
            });

            broker.logger.info("Middleware for transit encryption started");
        },

        transporterSend(next) {
            return async (topic, data, meta) => {
                data = Buffer.from( await _broker.encryption.encryptData(data, "transit"), "utf8");
                return next(topic, data, meta);
            }
        },
        transporterReceive(next) {
            return async (cmd, data, s) => {
                data = Buffer.from( await _broker.encryption.decryptData(data.toString(), "transit"), "utf8");
                return next(cmd, data, s)
            }
        }
    }
}
