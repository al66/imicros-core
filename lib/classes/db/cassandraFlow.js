/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

//TODO port db class from imicros-flow

const Cassandra = require("cassandra-driver");


class DB {
  
    constructor ({ logger, groups, options = {} }) {
         
        // Moleculer logger
        this.logger = logger;
 
        // groups provider
        this.groups = groups;

        // cassandra setup
        this.contactPoints = ( options.contactPoints ?? "127.0.0.1" ).split(",");
        this.datacenter = options.datacenter ?? "datacenter1";
        this.keyspace = options.keyspace ?? "imicros_flow";
        this.versionTable = options.versionTable ?? "versions";
        this.objectTable = options.objectTable ?? "objects";

        this.subscriptionTable = options.subscriptionTable ?? "subscriptions";
        this.activeTable = options.activeTable ?? "active";
        this.instanceTable = options.instanceTable ?? "instances";
        this.runningTable = options.runningTable ?? "running";
        this.completedTable = options.completedTable ?? "completed";
        this.failedTable = options.failedTable ?? "failed";
        this.tokenTable = options.tokenTable ?? "log";
        this.timerTable = options.timerTable ?? "timer";
        this.runnerTable = options.runnerTable ?? "runner";
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

    // store encrypted data: xml, parsed, attributes
    async saveProcess({ owner, accessToken, processId, versionId, xmlData, parsedData, attributes = {} }) {
        try {
            const xmlEncrypted = xmlData ? await this.groups.encrypt({ token: accessToken, data: { xmlData }}) : "";   // xmlData has type string 
            const parsedEncrypted = parsedData ? await this.groups.encrypt({ token: accessToken, data: parsedData }) : "";
            const attrubutesEncrypted = attributes ? await this.groups.encrypt({ token: accessToken, data: attributes }) : "";
            const queries = [];
            // update version table
            let query = "INSERT INTO " + this.versionTable + " (owner,process,deployed,version,attributes,xml,parsed) VALUES (:owner,:process,toTimeStamp(now()),:version,:attributes,:xml,:parsed);";
            let params = { 
                owner, 
                process: processId, 
                version: versionId, 
                attributes: attrubutesEncrypted,
                xml: xmlEncrypted,
                parsed: parsedEncrypted
            };
            queries.push({ query, params});
            // update active table
            query = "INSERT INTO " + this.activeTable + " (owner,process,deployed,version,attributes) VALUES (:owner,:process,toTimeStamp(now()),:version,:attributes);";
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return { processId, versionId };
        } catch (e) {
            this.logger.warn("DB: failed to store process", { e });
            throw new Error("DB: failed to store process", e);
        }
    }
    
    // retrieve process data decrypted
    async getProcess({ owner, accessToken, processId, versionId, xml = null }) {
        try {
            let returnValue = {
                processId: null,
                versionId: null,
                parsed: {},
                created: null
            };

            // query version table
            const query = `SELECT deployed, parsed ${xml ? ",xml" : ""} FROM ${this.versionTable} 
                     WHERE owner = :owner AND process = :processId AND version = :versionId;`;
            const params = {
                owner,
                processId,
                versionId
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {
                const parsedData = await this.groups.decrypt({ token: accessToken, encrypted: row.get("parsed") });
                returnValue = {
                    processId: processId,
                    versionId: versionId,
                    created: row.get("deployed"),
                    parsedData
                };
                // decrypt xml
                if (xml) {
                    const xmlContainer = await this.groups.decrypt({ token: accessToken, encrypted: row.get("xml")});   // xml type string 
                    returnValue.xmlData = xmlContainer.xmlData;
                }
                return returnValue;
            } else {
                this.logger.warn("Unvalid or empty result", { result, first: row, query, params });
                throw new Error("process not found");
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve process", { processId, versionId, e });
            throw new Error("DB: failed to retrieve process", e);
        }
    }

    // retrieve list of process versions for owner (and processId if given) - returned parsed is still encrypted
    async getVersionList({ owner, accessToken, processId = null }) {
        try {
            let list = [];
            // query active table
            let query = `SELECT process, version, deployed, attributes, active FROM ${this.activeTable}`;
            if (processId) {
                query += ` WHERE owner = :owner AND process = :processId;`;
            } else {
                query += ` WHERE owner = :owner;`;
            }
            const params = {
                owner,
                processId
            }
            let result = await this.cassandra.execute(query, params, {prepare: true});
            for (const row of result) {
                const attributes = await this.groups.decrypt({ token: accessToken, encrypted: row.get("attributes") });
                list.push({
                    processId: row["process"].toString(),
                    name: attributes.name,
                    versionId: row["version"].toString(),
                    deployedAt: row["deployed"],
                    activeInstances: row.get("active") || []
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve process versions", { e });
            throw new Error("DB: failed to retrieve process versions", e);
        }
    }

    async saveObject({ owner, accessToken, objectId, data }) {
        try {
            const dataEncrypted = data ? await this.groups.encrypt({ token: accessToken, data }) : "";
            const queries = [];
            // update object table
            let query = "INSERT INTO " + this.objectTable + " (owner,object,data) VALUES (:owner,:object,:data);";
            let params = { 
                owner, 
                object: objectId, 
                data: dataEncrypted
            };
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return { objectId };
        } catch (e) {
            this.logger.warn("DB: failed to store object", { e });
            throw new Error("DB: failed to store object", e);
        }
    }    

    async getObject({ owner, accessToken, objectId }) {
        try {
            // query object table
            const query = `SELECT object, data FROM ${this.objectTable} 
                     WHERE owner = :owner AND object = :object;`;
            const params = {
                owner,
                object: objectId
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {
                const decryptedData = await this.groups.decrypt({ token: accessToken, encrypted: row.get("data") });
                return decryptedData;
            } else {
                this.logger.warn("Unvalid or empty result", { result, first: row, query, params });
                throw new Error("object not found");
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve object", { objectId, e });
            throw new Error("DB: failed to retrieve object", e);
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
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.instanceTable} `;
        query += " ( owner uuid, instance uuid, version bigint, process uuid, processversion uuid, data varchar, PRIMARY KEY ((owner,instance)) ) ";
        query += " WITH comment = 'process instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.versionTable} `;
        query += " ( owner uuid, process uuid, version uuid, deployed timestamp, attributes varchar, xml varchar, parsed varchar, PRIMARY KEY ((owner,process),version) ) ";
        query += " WITH comment = 'process versions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.activeTable} `;
        query += " ( owner uuid, process uuid, version uuid, deployed timestamp, attributes varchar, active set<uuid>, PRIMARY KEY ((owner),process,version) ) ";
        query += " WITH comment = 'active process versions and instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.subscriptionTable} `;
        query += " ( owner uuid, type varchar, hash varchar, process uuid, version uuid, instance uuid, correlation varchar, PRIMARY KEY ((owner,type,hash),process,version,instance) ) ";
        query += " WITH comment = 'event, message and signal subscriptions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.timerTable} `;
        query += " ( day date, timeblock time, id uuid, time timestamp, type varchar, value varchar, owner uuid, process uuid, version uuid, instance uuid, elementId uuid, PRIMARY KEY ((day, timeblock), id) ) ";
        query += " WITH comment = 'storing scheduled tokens';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.objectTable} `;
        query += " ( owner uuid, object uuid, data varchar, PRIMARY KEY ((owner, object)) ) ";
        query += " WITH default_time_to_live = 804800 AND comment = 'temporary storage of objects for 10 days';";
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
 
