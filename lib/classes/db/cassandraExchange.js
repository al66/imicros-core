/**
 * @license MIT, imicros.de (c) 2018 Andreas Leinen
 */
"use strict";

const Cassandra = require("cassandra-driver");

class DB {
     
    constructor ({ logger, options }) {
         
        // Moleculer logger
        this.logger = logger;
 
        // Cassandra setup
        /* istanbul ignore else */
        if (!this.client) {
            this.whitelistTable = options?.cassandra?.whitelistTable ?? "allowed";
            this.messageTable = options?.cassandra?.messageTable ?? "messages";
        }
        this.contactPoints = ( options.contactPoints ?? ( process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1" ) ).split(",");
        this.datacenter = options.datacenter ?? ( process.env.CASSANDRA_DATACENTER || "datacenter1" );
        this.keyspace = options.keyspace ?? ( process.env.CASSANDRA_KEYSPACE_EXCHANGE  || "imicros_exchange" );
        this.whitelistTable = options?.whitelistTable ?? "allowed";
        this.messageTable = options?.messageTable ?? "messages";
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

    async checkForMessage ({ hash }) {
        let query = "SELECT message FROM " + this.messageTable + " WHERE message = :hash;";
        let params = { 
            hash
        };
        try {
            const result = await this.cassandra.execute(query, params, {prepare: true});
            return ( result.first()?.get("message").toString() || null ) === hash;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            return false;
        }
    }


    async addMessage ({ hash }) {
        let query = "INSERT INTO " + this.messageTable + " (message) VALUES (:hash) USING TTL 604800;"; //  7 days = 604800 seconds
        let params = { 
            hash
        };
        try {
            await this.cassandra.execute(query, params, {prepare: true});
            return true;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            return false;
        }
    }

    async checkWhiteList ({ hash }) {
        let query = "SELECT allowed FROM " + this.whitelistTable + " WHERE allowed = :hash;";
        let params = { 
            hash
        };
        try {
            const result = await this.cassandra.execute(query, params, {prepare: true});
            return ( result.first()?.get("allowed").toString() || null ) === hash;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            return false;
        }
    }
     
    async removeFromWhiteList ({ hash }) {
        let query = "DELETE FROM " + this.whitelistTable + " WHERE allowed = :hash;";
        let params = { 
            hash
        };
        try {
            await this.cassandra.execute(query, params, {prepare: true});
            return true;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            return false;
        }
    }
     
    async addToWhiteList ({ hash }) {
        let query = "INSERT INTO " + this.whitelistTable + " (allowed) VALUES (:hash);";
        let params = { 
            hash
        };
        try {
            await this.cassandra.execute(query, params, {prepare: true});
            return true;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            return false;
        }
    }
    

    /**
      * Connect to database
      */
    async connect() {

        // connect to cassandra cluster
        await this.cassandra.connect();
        this.logger.info("Connected to cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });

        // create tables, if not exists
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.whitelistTable} `;
        query += " ( allowed varchar, PRIMARY KEY (allowed) ) ";
        query += " WITH comment = 'whitelist hashes sender/recipient';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.messageTable} `;
        query += " ( message varchar, PRIMARY KEY (message) ) ";
        query += " WITH comment = 'messages hashes';";
        await this.cassandra.execute(query);
        
    }
 
    /**
      * Disconnect from database
      */
    async disconnect() {
         
        /* istanbul ignore next */
        if (!this.cassandra) return Promise.resolve();

        // close all open connections to cassandra
        await this.cassandra.shutdown();
        this.logger.info("Disconnected from cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
         
    }
 
}
 
module.exports = {
    DB
};