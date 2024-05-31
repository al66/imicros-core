/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const Cassandra = require("cassandra-driver");
const crypto = require("crypto");

class DB {
  
    constructor ({ logger, groups, options = {} }) {
         
        // Moleculer logger
        this.logger = logger;
 
        // groups provider
        this.groups = groups;

        // cassandra setup
        this.contactPoints = ( options.contactPoints ?? "127.0.0.1" ).split(",");
        this.datacenter = options.datacenter ?? "datacenter1";
        this.keyspace = options.keyspace ?? "imicros_decision";
        this.decisionTable = options.decisionTable ?? "decisions";
        this.eventTable = options.eventTable ?? "events";
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
            },
            maxRequestsPerConnection: options.maxRequestsPerConnection || 1024
        };
        this.cassandra = new Cassandra.Client(this.config);
        /*
        this.cassandra.on('log', (level, loggerName, message, furtherInfo) => {
            console.log(`${level} - ${loggerName}:  ${message}`);
        });
        */
 
    }

    // store encrypted data: xmlData, parsed
    async save({ owner, accessToken, xmlData, parsed }) {
        if (!parsed.id) throw new Error("DB: missing id in parsed data");
        try {
            const hash = this.getHash(parsed.id);
            const xmlEncrypted = xmlData ? await this.groups.encrypt({ accessToken, data: { xmlData }}) : "";   // xmlData has type string 
            const parsedEncrypted = parsed ? await this.groups.encrypt({ accessToken, data: parsed }) : "";
            const eventEncrypted = await this.groups.encrypt({ accessToken, data: { event: "saved", accessToken, xmlData, parsed }});
            const queries = [];
            // update decision table
            let query = "INSERT INTO " + this.decisionTable + " (owner,hash,xml,parsed) VALUES (:owner,:hash, :xml,:parsed);";
            let params = { 
                owner, 
                hash, 
                xml: xmlEncrypted,
                parsed: parsedEncrypted,
                event: eventEncrypted
            };
            queries.push({ query, params});
            // update event table
            query = "INSERT INTO " + this.eventTable + " (owner,hash,timeuuid, data) VALUES (:owner,:hash, now(),:event);";
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to store process", { e });
            throw new Error("DB: failed to store process", e);
        }
    }
    
    // retrieve decision data
    async get({ owner, accessToken, businessRuleId, xml = false }) {
        if (!businessRuleId) throw new Error("DB: missing businessRuleId in parameter");
        try {
            const hash = this.getHash(businessRuleId);
            let returnValue = {
                businessRuleId: null,
                parsed: {}
            };

            // query decision table
            const query = `SELECT parsed ${xml ? ",xml" : ""} FROM ${this.decisionTable} 
                     WHERE owner = :owner AND hash = :hash;`;
            const params = {
                owner,
                hash
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {
                const parsedData = await this.groups.decrypt({ accessToken, encrypted: row.get("parsed") });
                returnValue = {
                    businessRuleId: parsedData.id,
                    parsed: parsedData
                };
                // decrypt xml
                if (xml) {
                    const xmlContainer = await this.groups.decrypt({ accessToken, encrypted: row.get("xml")});   // xml type string 
                    returnValue.xmlData = xmlContainer.xmlData;
                }
                return returnValue;
            } else {
                this.logger.warn("Unvalid or empty result", { result, first: row, query, params });
                throw new Error("decision not found");
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve decision", { businessRuleId, e });
            throw new Error("DB: failed to retrieve decision", e);
        }
    }

    // retrieve list of decisions for owner
    async getList({ owner, accessToken}) {
        try {
            let list = [];
            // query decision table
            let query = `SELECT parsed FROM ${this.decisionTable} WHERE owner = :owner ;`;
            const params = {
                owner
            }
            let result = await this.cassandra.execute(query, params, {prepare: true});
            for (const row of result) {
                const parsedData = await this.groups.decrypt({ accessToken, encrypted: row.get("parsed") });
                list.push({
                    businessRuleId: parsedData.id
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve decision list", { e });
            throw new Error("DB: failed to retrieve decision list", e);
        }
    }

    async delete({ owner, accessToken, businessRuleId }) {
        if (!businessRuleId) throw new Error("DB: missing businessRuleId in parameter");
        try {
            const hash = this.getHash(businessRuleId);
            const eventEncrypted = await this.groups.encrypt({ accessToken, data: { event: "deleted", accessToken, businessRuleId }});
            const queries = [];
            // delete decision table
            let query = `DELETE FROM ${this.decisionTable} WHERE owner = :owner AND hash = :hash;`;
            let params = {
                owner,
                hash,
                event: eventEncrypted
            }
            queries.push({ query, params});
            // update event table
            query = "INSERT INTO " + this.eventTable + " (owner,hash,timeuuid, data) VALUES (:owner,:hash, now(),:event);";
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to delete decision", { businessRuleId, e });
            throw new Error("DB: failed to delete decision", e);
        }
    }

    async getEvents({ owner, accessToken, businessRuleId }) {
        if (!businessRuleId) throw new Error("DB: missing businessRuleId in parameter");
        try {
            const hash = this.getHash(businessRuleId);
            let list = [];
            // query event table
            let query = `SELECT timeuuid as time, data FROM ${this.eventTable} WHERE owner = :owner AND hash = :hash;`;
            const params = {
                owner,
                hash
            }
            let result = await this.cassandra.execute(query, params, {prepare: true});
            for (const row of result) {
                const eventData = await this.groups.decrypt({ accessToken, encrypted: row.get("data") });
                list.push({
                    time: row.get("time").getDate(),
                    ...eventData
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve events", { businessRuleId, e });
            throw new Error("DB: failed to retrieve events", e);
        }
    }

    getHash(value) {
        return crypto.createHash("sha256")
            .update(value)
            .digest("hex");
    }

    /** called in service created */
    async init () {

    }

    /** called in service started */
    async connect () {

        // connect to cassandra cluster
        await this.cassandra.connect();
        this.logger.info("Connected to cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
        /*** create tables, if not exists ***/ 

        /* decision table 
            - with parsed decision and xml original 
            - with partition key ownerId 
            - with clustering key decision hash
        */
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.decisionTable} `;
        query += " ( owner uuid, hash varchar, parsed varchar, xml varchar, PRIMARY KEY ((owner),hash) ) ";
        query += " WITH comment = 'decisions';";
        await this.cassandra.execute(query);

        /* event table
            - with partition key ownerId
            - with clustering key decision hash and event timestamp
        */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.eventTable} `;
        query += " ( owner uuid, hash varchar, timeuuid timeuuid, data varchar, PRIMARY KEY ((owner), hash, timeuuid) ) ";
        query += " WITH comment = 'event store for a decision';";
        await this.cassandra.execute(query);

    }
    
    /** called in service stopped */
    async disconnect () {

        // close all open connections to cassandra
        await this.cassandra.shutdown();
        this.logger.info("Disconnected from cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
    } 

};

module.exports = {
    DB
};
 
