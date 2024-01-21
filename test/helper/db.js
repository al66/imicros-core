"use strict";

// Build provider for MemoryDB
const { DefaultDatabase } = require("../../lib/classes/cqrs/cqrs");
const database = new  DefaultDatabase();
const MemoryDB = {
    async created () {
        this.db = database;
    }
}

// Build provider for CassandraDB
const { DB } = require("../../lib/classes/db/cassandraCQRS");
const CassandraDB = {
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
        console.log("Service start db", this.name);
        await this.db.connect();
    },
    async stopped () {
        await this.db.disconnect();
    }
}

module.exports = {
    MemoryDB,
    CassandraDB
};