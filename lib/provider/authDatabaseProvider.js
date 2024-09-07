/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraCQRS");

const AuthDatabaseProvider = {
    async created () {
        this.db = new DB({
            logger: this.broker.logger,
            encryption: this.encryption,
            options: { 
                contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth"
            },
            services: {}
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
    AuthDatabaseProvider
};