/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const Cassandra = require("cassandra-driver");
 
class DB {

    constructor ({ logger, options = {}}) {
         
        // Moleculer logger
        this.logger = logger;
 
        // cassandra setup
        this.contactPoints = ( options.contactPoints ?? "127.0.0.1" ).split(",");
        this.datacenter = options.datacenter ?? "datacenter1";
        this.keyspace = options.keyspace ?? "imicros_auth";
        this.hashTable = options.hashTable ?? "hashes";
        this.config = {
            contactPoints: this.contactPoints, 
            localDataCenter: this.datacenter, 
            keyspace: this.keyspace, 
            protocolOptions: { 
                port: options.port ?? (process.env.CASSANDRA_PORT || 9042 )
            },
            credentials: { 
                username: options.user ?? (process.env.CASSANDRA_USER || "cassandra"), 
                password: options.password ?? (process.env.CASSANDRA_PASSWORD || "cassandra") 
            }
        };
        this.cassandra = new Cassandra.Client(this.config);
    }
    
    async storeHashes({ hashes }) {
        let query = `UPDATE ${this.keyspace}.${this.hashTable} SET hashes = :hashes WHERE id = 1;`;
        let params = { 
            hashes            };
        try {
            await this.cassandra.execute(query, params, {prepare: true});
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            throw new Error("failed to write hashes");
        }
    }

    async readHashes() {
        let query = `SELECT hashes FROM ${this.keyspace}.${this.hashTable} WHERE id = 1;`;
        let params = { };
        try {
            let result = await this.cassandra.execute(query, params, {prepare: true});
            let row = result.first();
            if (row) {
                let hashes = row.get("hashes");            
                return { hashes };
            }
            return null;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra query error", { error: err.message, query: query, params: params });
            return null;
        }
    }

    async checkHashes() {
        let query = `SELECT hashes FROM ${this.keyspace}.${this.hashTable} WHERE id = 1;`;
        let params = { };
        try {
            let result = await this.cassandra.execute(query, params, {prepare: true});
            let row = result.first();
            if (row) return false;
            return true;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra query error", { error: err.message, query: query, params: params });
            return false;
        }
    }        

    async reset() {
        let query = `DELETE FROM ${this.keyspace}.${this.hashTable} WHERE id = 1;`;
        let params = { };
        try {
            await this.cassandra.execute(query, params, {prepare: true});
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra delete error", { error: err.message, query: query, params: params });
            throw new Error("failed to reset hashes");
        }
    }

    /** called in service created */
    async init () {

    }
 
    /** called in service started */
    async connect () {
 
        // connect to cassandra cluster
        await this.cassandra.connect();
        this.logger.info("Connected to cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
         
        // create tables, if not exists
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.hashTable} `;
        query += " ( id int, hashes frozen<list<text>>, PRIMARY KEY (id) ) ";
        query += " WITH comment = 'storing hashes';";
        await this.cassandra.execute(query);
 
    }
     
    /** called in service stopped */
    async disconnect () {
 
        // close all open connections to cassandra
        await this.cassandra.shutdown();
        this.logger.info("Disconnected from cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
         
    } 
 
}
 
module.exports = {
    DB
};
