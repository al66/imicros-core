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

    // store already encrypted data: xml, parsed, attributes
    async saveProcess({ owner, accessToken, processId, versionId, xmlData, parsedData, attributes = {} }) {
        try {
            // update process table ?? needed ??
            // update version table
            const xmlEncrypted = xmlData ? await this.groups.encrypt({ token: accessToken, data: { xmlData }}) : "";   // xmlData has type string 
            const parsedEncrypted = parsedData ? await this.groups.encrypt({ token: accessToken, data: parsedData }) : "";
            const attrubutesEncrypted = attributes ? await this.groups.encrypt({ token: accessToken, data: attributes }) : "";
            const queries = [];
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
            await this.cassandra.batch(queries, {prepare: true});
            return { processId, versionId };
        } catch (e) {
            this.logger.warn("DB: failed to store process", { e });
            throw new Error("DB: failed to store process", e);
        }
    }
    
    // retrieve encrypted process data
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
    async getVersionList({ owner, processId = null }) {
        try {
            let list = [];

            // query version table
            let query = `SELECT process, version, deployed, parsed FROM ${this.versionTable}`;
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
                list.push({
                    processId: row["process"].toString(),
                    versionId: row["version"].toString(),
                    created: row["deployed"],
                    parsed: row.get("parsed")
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve process versions", { e });
            throw new Error("DB: failed to retrieve process versions", e);
        }
    }

    async logToken ({ owner, instanceId, consume = [], emit = [] }) {
        try {
            const returnValue = {
                instanceId,
                consumed: consume,
                emitted: emit
            };
            // anything to do?
            if (consume.length > 0 || emit.length > 0) {
                // update token table
                let query = "UPDATE " + this.tokenTable +" SET "
                let more = false;
                await consume.forEach(async token => {
                    token = await this.serializer.serialize(token);
                    query += (more ? "," : "") + " active = active - {'" + token + "'} ";
                    more = true;
                    query += (more ? "," : "") + " history = history + { now() : '" + token + "'} ";
                })
                await emit.forEach(async token => {
                    token = await this.serializer.serialize(token);
                    query += (more ? "," : "") + " active = active + {'" + token + "'} ";
                    more = true;
                })
                query += ` WHERE owner = '${owner}' AND instance = ${instanceId};` ;
                await this.cassandra.execute(query);
            } 
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to log token", { instanceId, e });
            throw new Error("DB: failed to log token", e);
        }
    }

    async getToken ({ owner, instanceId, history = false }) {
        try {
            const returnValue = {
                instanceId,
                active: []
            };
            if (history) returnValue.history = [];
            // query token table
            let query = "SELECT active FROM " + this.tokenTable +" "
            if (history) query = "SELECT active, history FROM " + this.tokenTable +" "
            query += " WHERE owner = :owner AND instance = :instance;";
            let params = { 
                owner,
                instance: instanceId
            };
            let result = await this.cassandra.execute(query, params, { prepare: true });
            let row = result.first();
            let dbActive = [];
            let dbHistory = {};
            if (row) {
                let active = row.get("active");
                if (active) dbActive  = Array.isArray(active) ? active : [active];
                if (history) dbHistory = row.get("history");
            }
            returnValue.active = await Promise.all(dbActive.map(async token => await this.serializer.deserialize(token)));
            for(
                let uuid in dbHistory) {
                   returnValue.history.push({
                    time: this._getDateFromUuid(uuid),
                    token: await this.serializer.deserialize(dbHistory[uuid])
                })
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to read token", { instanceId, e });
            throw new Error("DB: failed to read token", e);
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
        query += " ( owner uuid, process uuid, version uuid, instance uuid, created timestamp, PRIMARY KEY (owner,process,version,instance) ) ";
        query += " WITH comment = 'storing process instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.runningTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, started timestamp, PRIMARY KEY (owner,process,version,instance) ) ";
        query += " WITH comment = 'storing running instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.completedTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, finished timestamp, PRIMARY KEY (owner,process,version,instance,finished) ) ";
        query += " WITH comment = 'storing completed instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.failedTable} `;
        query += " ( owner uuid, process uuid, version uuid, instance uuid, finished timestamp, PRIMARY KEY (owner,process,version,instance,finished) ) ";
        query += " WITH comment = 'storing failed instances';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.tokenTable} `;
        query += " ( owner uuid, instance uuid, active set<text>, history map<timeuuid,text> ,PRIMARY KEY (owner,instance) ) ";
        query += " WITH comment = 'storing instance token';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.versionTable} `;
        query += " ( owner uuid, process uuid, version uuid, deployed timestamp, attributes varchar, xml varchar, parsed varchar, PRIMARY KEY (owner,process,version,deployed) ) ";
        query += " WITH comment = 'storing process versions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.subscriptionTable} `;
        query += " ( owner uuid, event varchar, process uuid, version uuid, element uuid, data varchar, PRIMARY KEY (owner,event,process,version,element) ) ";
        query += " WITH comment = 'storing event subscriptions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.activeTable} `;
        query += " ( owner uuid, active map<uuid,uuid>, PRIMARY KEY (owner) ) ";
        query += " WITH comment = 'storing active process versions';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.timerTable} `;
        query += " ( day date, timeblock timestamp, id uuid, time timestamp, payload varchar, PRIMARY KEY ((day), timeblock, id) ) ";
        query += " WITH comment = 'storing scheduled tokens';";
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.runnerTable} `;
        query += " ( day date, timeblock timestamp, runner uuid, fetched timestamp, confirmed timestamp, PRIMARY KEY ((day), timeblock) ) ";
        query += " WITH comment = 'storing processing of scheduled tokens';";
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
 
