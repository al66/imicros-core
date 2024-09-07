/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraVault");

const VaultDatabaseProvider = {
    async created () {
        this.db = new DB({
            logger: this.broker.logger,
            options: {
                contactPoints: this.settings?.db?.contactPoints || process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                datacenter: this.settings?.db?.datacenter || process.env.CASSANDRA_DATACENTER || "datacenter1", 
                keyspace: this.settings?.db?.keyspace || process.env.CASSANDRA_KEYSPACE || "imicros_keys" ,
                hashTable: this.settings?.db?.hashTable || "hashes"
            }
        });
    },
    async started () {
        this.logger.info("Service start db", this.name);
        await this.db.connect();
    },
    async stopped () {
        await this.db.disconnect();
    }
}

module.exports = {
    VaultDatabaseProvider
};
