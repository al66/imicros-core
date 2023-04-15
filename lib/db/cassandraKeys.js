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
        this.keysTable = options.keysTable ?? "appkeys";
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
 
    async newKey({ owner, id, key, iat, exp }) {
        const value = JSON.stringify({
            key,
            iat,
            exp
        });
        let query = `UPDATE ${this.keyspace}.${this.keysTable} SET keychain['default'] = :newId, keychain[:newId] = :value WHERE owner = :owner;`;
        let params = { 
            owner,
            newId: id,
            value
        };
        try {
            await this.cassandra.execute(query, params, {prepare: true});
            return true;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra insert error", { error: err.message, query: query, params: params });
            throw new Error("failed to write new key");
        }
    }

    async readKeys({ owner }) {
        if (!owner) return null;

        let query = `SELECT owner,keychain FROM ${this.keyspace}.${this.keysTable} WHERE owner = :owner;`;
        let params = { 
            owner
        };
        try {
            let result = await this.cassandra.execute(query, params, {prepare: true});
            let row = result.first();
            if (row) {
                let keys = {};
                for (const [key,value] of Object.entries(row.get("keychain"))) {
                    keys[key] = key === 'default' ? value.toString() : JSON.parse(value);
                }
                return {
                    owner: row.get("owner"),
                    keys: keys
                };
            }
            return null;
        } catch (err) /* istanbul ignore next */ {
            this.logger.error("Cassandra query error", { error: err.message, query: query, params: params });
            throw new Error("failed to retrieve keys");
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
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.keysTable} 
                    ( owner varchar, keychain map<text, text>, PRIMARY KEY (owner) )
                     WITH comment = 'storing application keys';`;
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