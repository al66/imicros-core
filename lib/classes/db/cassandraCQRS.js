/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const Cassandra = require("cassandra-driver");
 
class DB {
  
    constructor ({ logger, encryption, options = {}, services = {}}) {
         
        // Moleculer logger
        this.logger = logger;
 
        // encryption instance
        this.encryption = encryption;

        // cassandra setup
        this.contactPoints = ( options.contactPoints ?? ( process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1" ) ).split(",");
        this.datacenter = options.datacenter ?? ( process.env.CASSANDRA_DATACENTER || "datacenter1" );
        this.keyspace = options.keyspace ?? ( process.env.CASSANDRA_KEYSPACE_AUTH  || "imicros_auth" );
        this.eventTable = options.eventTable ?? "events";
        this.uniqueKeyTable = options.uniqueKeyTable ?? "unique";
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
 
    /** called in service created */
    async init () {

    }

    /** called in service started */
    async connect () {

        // connect to cassandra cluster
        await this.cassandra.connect();
        this.logger.info("Connected to cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
        // create tables, if not exists
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.eventTable} 
                    ( uid uuid, timeuuid timeuuid, version bigint, value varchar, PRIMARY KEY ((uid), timeuuid) )
                     WITH comment = 'storing events';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.uniqueKeyTable} 
                    ( hash varchar, uid uuid, PRIMARY KEY (hash) )
                    WITH comment = 'storing foreign unique keys';`;
        await this.cassandra.execute(query);

}
    
    /** called in service stopped */
    async disconnect () {

        // close all open connections to cassandra
        await this.cassandra.shutdown();
        this.logger.info("Disconnected from cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
    } 

    async persist({ uid, version, event }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.persist({ uid, version, event });
    }

    async read({ uid, complete = false }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.read({ uid, complete });
    }

    async saveSnapshot({ uid, version, snapshot, timeuuid }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.saveSnapshot({ uid, version, snapshot, timeuuid });
    }

    async preserveUniqueKey({ key, uid }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.preserveUniqueKey({ key, uid });
    }

    async getIdByUniqueKey({ key }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.getIdByUniqueKey({ key });
    }

    async getLog({ uid, from, to }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.getLog({ uid, from, to });
    }

    async delete({ uid }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.delete({ uid });
    }

    async deleteUniqueKey({ key }) {
        const CQRS = this.getCQRSInterface();
        return CQRS.deleteUniqueKey({ key });
    }

    /** interfaces */
    getCQRSInterface () {
        return new CQRS({ 
            cassandra: this.cassandra, 
            encryption: this.encryption, 
            logger: this.logger, 
            tables: {
                event: this.eventTable,
                uniqueKey: this.uniqueKeyTable
            }
        });
    }

};

class CQRS {
    constructor ({ cassandra, encryption, logger, tables }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.eventTable = tables.event;
        this.uniqueKeyTable = tables.uniqueKey;
    }

    async persist({ uid, version, event }) {
        const versionTimestamp = new Date('1970-01-01 00:00:00+0000')
        try {
            if (version === 0)  {
                const query = `INSERT INTO ${this.eventTable} (uid,timeuuid,version) VALUES (:uid,minTimeuuid(:timestamp),:version) IF NOT EXISTS;`;
                const params = { 
                    uid,
                    timestamp: versionTimestamp,
                    version
                };
                await this.cassandra.execute(query, params, {prepare: true}); 
            }
            const queries = [];
            const events = Array.isArray(event) ? event : [event];
            for (const event of events) {
                const encrypted = await this.encryption.encryptData(event);
                // insert db            
                const query = `INSERT INTO ${this.eventTable} (uid,timeuuid,value) VALUES (:uid,now(),:value);`;
                const params = { 
                    uid, 
                    value: encrypted
                };
                queries.push({ query, params});
            };
            const query = `UPDATE ${this.eventTable} SET version = :version WHERE uid = :uid AND timeuuid = minTimeuuid(:timestamp) IF version = :version;`;
            const params = { 
                uid, 
                timestamp: versionTimestamp,
                version
            };
            queries.push({ query, params});
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            return result.first()?.get("[applied]") || false;
        } catch (e) {
            this.logger.warn("DB: failed to persist event", { uid, version, e });
            throw new Error("DB: failed to persist event", e);
        }
    }

    async read({ uid, complete = false }) {
        const versionTimestamp = new Date('1970-01-01 00:00:00+0000')
        const returnValue = {
            uid,
            version: 0,
            snapshot: null,
            timeuuid: null,
            events: []
        }
        try {
            if (!complete) {
                // read snapshot
                const query = `SELECT uid,version,value FROM ${this.eventTable} WHERE uid = :uid AND timeuuid = minTimeuuid(:timestamp);`;
                const params = { 
                    uid,
                    timestamp: versionTimestamp
                };
                let result = await this.cassandra.execute(query, params, {prepare: true});
                let row = result.first();
                if (row) {
                    const value = row.get("value");
                    if (value) {
                        const decrypted = await this.encryption.decryptData(value);
                        returnValue.snapshot = decrypted.snapshot;
                        returnValue.timeuuid = decrypted.timeuuid;
                        returnValue.version = Number(row.get("version"));
                    }
                    if (!returnValue.timeuuid || !returnValue.snapshot ) {
                        delete returnValue.snapshot;
                        delete returnValue.timeuuid;
                        complete = true;
                    } 
                } else {
                    complete = true;
                }
            }
            if (complete) {
                const query = `SELECT uid,timeuuid,value FROM ${this.eventTable} WHERE uid = :uid AND timeuuid > minTimeuuid(:timestamp) ORDER BY timeuuid ASC;`;
                const params = { 
                    uid,
                    timestamp: versionTimestamp
                };
                const result = await this.cassandra.execute(query, params, {prepare: true}); 
                for (const row of result) {
                    const value = row.get("value");
                    if (value) {
                        const decrypted = await this.encryption.decryptData(value);
                        const event = Object.assign({ $_timeuuid:  row.get("timeuuid").toString() }, decrypted);
                        returnValue.events.push(event);
                    }
                }
            } else {
                const query = `SELECT uid,timeuuid,value FROM ${this.eventTable} WHERE uid = :uid AND timeuuid > ${returnValue.timeuuid} ORDER BY timeuuid ASC;`;
                const params = { 
                    uid,
                    from: returnValue.timeuuid
                };
                const result = await this.cassandra.execute(query, params, {prepare: true}); 
                for (const row of result) {
                    const value = row.get("value");
                    if (value) {
                        const decrypted = await this.encryption.decryptData(value);
                        const event = Object.assign({ $_timeuuid:  row.get("timeuuid").toString() }, decrypted);
                        returnValue.events.push(event);
                    }
                }
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to read aggregate", { uid, e });
            throw new Error("DB: failed to read aggregate", e);
        }
    }

    async saveSnapshot({ uid, version, snapshot, timeuuid }) {
        const versionTimestamp = new Date('1970-01-01 00:00:00+0000')
        const encrypted = await this.encryption.encryptData({ snapshot, timeuuid });
        const query = `UPDATE ${this.eventTable} SET version = :version, value = :value WHERE uid = :uid AND timeuuid = minTimeuuid(:timestamp) IF version = :previous;`;
        const params = { 
            uid,
            timestamp: versionTimestamp,
            version,
            previous: version - 1,
            value: encrypted
        };
        const result = await this.cassandra.execute(query, params, {prepare: true}); 
        return result.first()?.get("[applied]") || false;
    }

    async preserveUniqueKey({ key, uid }) {
        try {
            const hash = this.encryption.getHash(key);
            const query = `INSERT INTO ${this.uniqueKeyTable} (hash,uid) VALUES (:hash,:uid) IF NOT EXISTS;`;
            const params = { 
                hash,
                uid
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            if (!result.first()?.get("[applied]")) {
                return this.getIdByUniqueKey({ key });
            }
            return uid;
        } catch (e) {
            this.logger.warn("DB: failed to preserve unique key", { key, uid, e });
            throw new Error("DB: failed to preserve unique key", e);
        }
    }

    async getIdByUniqueKey({ key }) {
        try {
            const hash = this.encryption.getHash(key);
            const query = `SELECT uid FROM ${this.uniqueKeyTable} WHERE hash = :hash;`;
            const params = { 
                hash
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            return result.first()?.get("uid").toString() || null;
        } catch (e) {
            this.logger.warn("DB: failed to read unique key", { key, e });
            throw new Error("DB: failed to read unique key", e);
        }
    }
    
    async delete({ uid }) {
        try {
            const query = `DELETE FROM ${this.eventTable} WHERE uid = :uid;`;
            const params = { 
                uid
            };
            await this.cassandra.execute(query, params, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to delete aggregate", { uid, e });
            throw new Error("DB: failed to delete aggregate", e);
        }
    }

    async deleteUniqueKey({ key }) {
        try {
            const hash = this.encryption.getHash(key);
            const query = `DELETE FROM ${this.uniqueKeyTable} WHERE hash = :hash;`;
            const params = { 
                hash
            };
            await this.cassandra.execute(query, params, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to delete unique key", { key, e });
            throw new Error("DB: failed to delete unique key", e);
        }
    }

    async getLog({ uid, from, to }) {
        let events = [];
        const fromTime = from || new Date('1970-01-02 00:00:00+0000');
        const toTime = to || new Date();
        const limit = 10000;
        try {
            const query = `SELECT uid,timeuuid,value FROM ${this.eventTable} WHERE uid = :uid AND timeuuid > maxTimeuuid(:fromTime) AND timeuuid < minTimeuuid(:toTime) ORDER BY timeuuid ASC  LIMIT ${limit};`;
            const params = { 
                uid,
                fromTime,
                toTime
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                if (value) {
                    const decrypted = await this.encryption.decryptData(value);
                    const event = Object.assign({ $_timeuuid:  row.get("timeuuid").toString() }, decrypted);
                    events.push(event);
                }
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve log", { uid, fromTime, toTime, e });
            throw new Error("DB: failed to retrieve", e);
        }
        /*
        if (this.store[uid].events) {
            events = this.store[uid].events.filter((event, index) => {
                const time = this._getDateOfUuid(event.$_timeuuid);
                if (from && time < from) return false;
                if (to && time > to) return false;
                return true;
            });
        }
        */
        const result = {
            events,
            count: events.length,
            limit
        }
        return result;
    }

}

module.exports = {
    DB
};
 