/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

//TODO port db class from imicros-flow

const Cassandra = require("cassandra-driver");
const crypto = require("crypto");
const Long = require('cassandra-driver').types.Long;

const util = require("util");

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
        this.uniqueKeyTable = options.uniqueKeyTable ?? "unique";
        this.versionTable = options.versionTable ?? "versions";
        this.objectTable = options.objectTable ?? "objects";
        this.subscriptionTable = options.subscriptionTable ?? "subscriptions";
        this.activeTable = options.activeTable ?? "active";
        this.instanceTable = options.instanceTable ?? "instances";
        this.finishedTable = options.finishedTable ?? "finsihed";
        this.timerTable = options.timerTable ?? "timer";
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

    async preserveUniqueKey({ key, uid }) {
        try {
            const hash = this.getHash(key);
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
            const hash = this.getHash(key);
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

    // store encrypted data: xml, parsed, attributes
    async saveProcess({ owner, accessToken, processId, versionId, xmlData, parsedData, attributes = {} }) {
        try {
            const xmlEncrypted = xmlData ? await this.groups.encrypt({ accessToken, data: { xmlData }}) : "";   // xmlData has type string 
            const parsedEncrypted = parsedData ? await this.groups.encrypt({ accessToken, data: parsedData }) : "";
            const attrubutesEncrypted = attributes ? await this.groups.encrypt({ accessToken, data: attributes }) : "";
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
            //query = "INSERT INTO " + this.activeTable + " (owner,process,deployed,version,attributes) VALUES (:owner,:process,toTimeStamp(now()),:version,:attributes);";
            query = "UPDATE " + this.activeTable + " SET versions[:version] = toTimeStamp(now()), attributes = :attributes WHERE owner = :owner AND process = :process;";
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return { processId, versionId };
        } catch (e) {
            this.logger.warn("DB: failed to store process", { e });
            throw new Error("DB: failed to store process", e);
        }
    }
    
    // retrieve process data
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
                const parsedData = await this.groups.decrypt({ accessToken, encrypted: row.get("parsed") });
                returnValue = {
                    processId: processId,
                    versionId: versionId,
                    created: row.get("deployed"),
                    parsedData
                };
                // decrypt xml
                if (xml) {
                    const xmlContainer = await this.groups.decrypt({ accessToken, encrypted: row.get("xml")});   // xml type string 
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

    // retrieve list of process versions and instances for owner (and processId if given)
    async getVersionList({ owner, accessToken, processId = null, versions = false, instances = false}) {
        try {
            let list = [];
            // query active table
            let query = `SELECT process, version, activated, attributes `;
            query += ` ${ versions ? ", versions" : "" } `;
            query += ` ${ instances ? ", active" : "" } `;
            query += ` FROM ${this.activeTable}`;
            query += ` WHERE owner = :owner ${ processId ? " AND process = :processId" : "" };`;
            const params = {
                owner,
                processId
            }
            let result = await this.cassandra.execute(query, params, {prepare: true});
            for (const row of result) {
                const attributes = await this.groups.decrypt({ accessToken, encrypted: row.get("attributes") });
                const active = row.get("active") || {};
                const activeInstances = [];
                for (const [instanceId,versionId] of Object.entries(active)) {
                    activeInstances.push({
                        instanceId,
                        versionId: versionId.toString()
                    });
                }
                list.push({
                    processId: row["process"].toString(),
                    objectName: attributes.objectName,
                    localId: attributes.localId,
                    versionId: row["version"] ? row["version"].toString() : null,
                    activatedAt: row["activated"],
                    versions: row.get("versions") || {},
                    activeInstances
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve process versions", { e });
            throw new Error("DB: failed to retrieve process versions", e);
        }
    }

    async activateVersion({ owner, accessToken, processId, versionId, subscriptions = [], timers = [] }) {
        try {
            const queries = [];
            // update active table
            let query = `UPDATE ${this.activeTable} `;
            query += ` SET version = :versionId, activated = toTimeStamp(now()) `;
            query += ` WHERE owner = :owner AND process = :processId;`;
            let params = { 
                owner, 
                processId, 
                versionId
            };
            queries.push({ query, params});
            for (const subscription of subscriptions) {
                const subscriptionData = await this.groups.encrypt({ accessToken, data: {
                    processId: subscription.processId,
                    versionId: subscription.versionId,
                    correlation: subscription.correlation,
                    condition: subscription.condition
                }});
                const subscriptionId = subscription.subscriptionId;
                query = `UPDATE ${this.subscriptionTable} `;
                query += ` SET subscription[:subscriptionId] = '${ subscriptionData }' `;
                query += ` WHERE owner = :owner AND type = :type AND hash = :hash;`;
                params = { 
                    owner, 
                    type: subscription.type,
                    hash: subscription.hash,
                    subscriptionId,
                    subscriptionData
                };
                queries.push({ query, params});
            }
            for (const timer of timers) {
                const subscriptionData = await this.groups.encrypt({ accessToken, data: {
                    processId: timer.processId,
                    versionId: timer.versionId
                }});
                const timerData = await this.groups.encrypt({ accessToken, data: timer.timer });
                query = `INSERT INTO ${this.keyspace}.${this.timerTable} (day,time,partition,id,owner,timer, start, subscription) `;
                query += ` VALUES (:day,:time,:partition,:id,:owner,:timer,:start,:subscription);`;
                params = { 
                    day: timer.day, 
                    time: timer.time, 
                    partition: timer.partition || 0, 
                    id: timer.id, 
                    owner, 
                    timer: timerData, 
                    start: true,
                    subscription: subscriptionData
                };
                queries.push({ query, params});
            }
            await this.cassandra.batch(queries, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to activate version", { e });
            throw new Error("DB: failed to activate version", e);
        }
    }

    async deactivateVersion({ owner, processId }) {
        try {
            const queries = [];
            // update active table
            let query = `UPDATE ${this.activeTable} `;
            query += ` SET version = null, activated = null `;
            query += ` WHERE owner = :owner AND process = :processId;`;
            let params = { 
                owner, 
                processId
            };
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to deactivate version", { e });
            throw new Error("DB: failed to deactivate version", e);
        }
    }

    async createInstance({ owner, instanceId, processId, versionId }) {
        try {
            // update instance table - must be a lightweight transaction like in saveInstance, otherwise the update doesn't work correctly
            let query = `INSERT INTO ${this.keyspace}.${ this.instanceTable } (owner,instance,version,process,processversion) `;
            query += ` VALUES (:owner,:instance,0,:process,:processversion) IF NOT EXISTS;`;
            let params = { 
                owner, 
                instance: instanceId, 
                process: processId, 
                processversion: versionId,
            }
            let result = await this.cassandra.execute(query, params,{ prepare: true});
            if (!result.first()?.get("[applied]")) return false;
            // update active table - cannot be send as batch, because the first query must be a lightweight transaction
            query = `UPDATE ${this.keyspace}.${ this.activeTable } SET active[:instance] = :processversion WHERE owner = :owner AND process = :process;`;
            params = { 
                owner, 
                instance: instanceId, 
                process: processId, 
                processversion: versionId,
            }
            await this.cassandra.execute(query, params,{ prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to create instance", { e });
            throw new Error("DB: failed to create instance", e);
        }
    }

    async saveInstance({ owner, accessToken, instanceId, version, snapshot = {} }) {
        try {
            const snapshotEncrypted = await this.groups.encrypt({ accessToken, data: snapshot });
            // update instance table
            let query = `UPDATE ${this.keyspace}.${ this.instanceTable } SET version = :current, snapshot = :snapshot `;
            query += ` WHERE owner = :owner AND instance = :instance IF version = :previous;`; //  
            const params = { 
                owner, 
                instance: instanceId, 
                current: version,
                previous: version - 1,
                snapshot: snapshotEncrypted
            };
            const result = await this.cassandra.execute(query, params,{ prepare: true});
            return result.first()?.get("[applied]") || false;
        } catch (e) {
            this.logger.warn("DB: failed to store instance", { e });
            throw new Error("DB: failed to store instance", e);
        }
    }

    async finishInstance({ owner, accessToken, instanceId, version, processId, versionId, completed, snapshot = {} }) {
        try {
            const snapshotEncrypted = await this.groups.encrypt({ accessToken, data: snapshot });
            // update finished table
            let query = `INSERT INTO ${this.keyspace}.${ this.finishedTable } (owner,day,instance,process,processversion,version,completed,snapshot) `;
            query += ` VALUES (:owner,toDate(now()),:instance,:process,:processversion,:version,:completed,:snapshot);`;
            let params = { 
                owner, 
                instance: instanceId, 
                process: processId, 
                processversion: versionId,
                version: version,
                completed,
                snapshot: snapshotEncrypted
            };
            await this.cassandra.execute(query, params,{ prepare: true});
            // delete instance from instance table
            query = `DELETE FROM ${this.keyspace}.${ this.instanceTable } WHERE owner = :owner AND instance = :instance;`;
            await this.cassandra.execute(query, params,{ prepare: true});
            // update active table
            query = `DELETE active[:instance] FROM ${this.keyspace}.${ this.activeTable } WHERE owner = :owner AND process = :process;`;
            await this.cassandra.execute(query, params,{ prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to finish instance", { e });
            throw new Error("DB: failed to finish instance", e);
        }
    }

    async getInstance({ owner, accessToken, instanceId }) {
        try {
            // query instance table
            const query = `SELECT owner, version, process, processversion, snapshot FROM ${this.keyspace}.${this.instanceTable} 
                     WHERE owner = :owner AND instance = :instanceId;`;
            const params = {
                owner,
                instanceId
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {
                const snapshot = row.get("snapshot") ? await this.groups.decrypt({ accessToken, encrypted: row.get("snapshot") }) : {};
                return {
                    ownerId: row.get("owner").toString(),
                    instanceId,
                    version: Number(row.get("version")),
                    processId: row.get("process").toString(),
                    versionId: row.get("processversion").toString(),
                    snapshot
                };
            } else {
                this.logger.warn("Unvalid or empty result", { result, first: row, query, params });
                throw new Error("instance not found");
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve instance", { instanceId, e });
            throw new Error("DB: failed to retrieve instance", e);
        }
    }

    async getFinishedInstancesList({ owner, day }) {
        try {
            const list = [];
            // query finished table
            let query = `SELECT instance, process, processversion, version, completed FROM ${this.keyspace}.${this.finishedTable} `;
            query += ` WHERE owner = :owner AND day = :day;`;
            const params = {
                owner,
                day
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            for (const row of result) {
                list.push({
                    instanceId: row.get("instance").toString(),
                    processId: row.get("process").toString(),
                    versionId: row.get("processversion").toString(),
                    version: row.get("version"),
                    completed: row.get("completed")
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve finished instances", { e });
            throw new Error("DB: failed to retrieve finished instances", e);
        }
    }

    async getFinishedInstance({ owner, accessToken, day, instanceId }) {
        try {
            // query finished table
            let query = `SELECT instance, process, processversion, version, completed, snapshot FROM ${this.keyspace}.${this.finishedTable} `;
            query += ` WHERE owner = :owner AND day = :day AND instance = :instance;`;
            const params = {
                owner,
                day,
                instance: instanceId,
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {
                const snapshot = await this.groups.decrypt({ accessToken, encrypted: row.get("snapshot") });
                return {
                    ownerId: owner,
                    instanceId: row.get("instance").toString(),
                    processId: row.get("process").toString(),
                    versionId: row.get("processversion").toString(),
                    version: row.get("version"),
                    completed: row.get("completed"),
                    snapshot
                };
            } else {
                return null;
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve finished instance", { e });
            throw new Error("DB: failed to retrieve finished instance", e);
        }
    }

    async saveObject({ owner, accessToken, objectId, data }) {
        try {
            const dataEncrypted = data ? await this.groups.encrypt({ accessToken, data }) : "";
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
                const decryptedData = await this.groups.decrypt({ accessToken, encrypted: row.get("data") });
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

    async addSubscription({ owner, accessToken, subscriptionId, type, hash, processId, versionId, instanceId = null, correlation = null, condition = null}) {
        try {
            const subscription = await this.groups.encrypt({ accessToken, data: {
                processId,
                versionId,
                instanceId,
                correlation,
                condition
            }});
            const queries = [];
            // update subscription table
            let query = `UPDATE ${this.subscriptionTable} `;
            query += ` SET subscription[:subscriptionId] = '${ subscription }' `;
            query += ` WHERE owner = :owner AND type = :type AND hash = :hash;`;
            let params = { 
                owner, 
                type,
                hash,
                subscriptionId
            };
            queries.push({ query, params});
            await this.cassandra.batch(queries, {prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to add subscription", { e });
            throw new Error("DB: failed to add subscription", e);
        }
    }    

    async removeSubscription({ owner, subscriptionId, type, hash}) {
        try {
            // update subscription table
            let query = `UPDATE ${this.subscriptionTable} `;
            query += ` SET subscription = subscription - { ${ subscriptionId } } `;
            query += ` WHERE owner = :owner AND type = :type AND hash = :hash;`;
            let params = { 
                owner, 
                type,
                hash,
                subscriptionId
            };
            await this.cassandra.execute(query, params,{ prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to remove subscription", { e });
            throw new Error("DB: failed to remove subscription", e);
        }
    }    

    async getSubscriptions({ owner, accessToken, type, hash }) {
        try {
            const queries = [];
            // update subscription table
            let query = `SELECT subscription FROM ${this.subscriptionTable} `;
            query += ` WHERE owner = :owner AND type = :type AND hash = :hash;`;
            let params = { 
                owner, 
                type,
                hash
            };
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            let row = result.first();
            if (row) {
                const subscriptions = [];
                for (const [key,value] of Object.entries(row.get("subscription"))) {
                    const subscription = {
                        subscriptionId: key,
                        subscription: await this.groups.decrypt({ accessToken, encrypted: value })
                    };
                    subscriptions.push(subscription);
                }
                return subscriptions;
            } else {
                return [];
            }
        } catch (e) {
            this.logger.warn("DB: failed to retrieve subscriptions", { owner, type, hash, e});
            throw new Error("DB: failed to retrieve subscriptions", e);
        }
    }    

    async addTimer({ day, time, partition, id, owner, timer, start, subscription }) {
        try {
            // update timer table
            let query = `INSERT INTO ${this.keyspace}.${this.timerTable} (day,time,partition,id,owner,timer, start, subscription) `;
            query += ` VALUES (:day,:time,:partition,:id,:owner,:timer,:start,:subscription);`;
            let params = { 
                day, 
                time, 
                partition, 
                id, 
                owner, 
                timer, 
                start,
                subscription
            };
            this.cassandra.execute(query, params,{ prepare: true});
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to add timer", { e });
            throw new Error("DB: failed to add timer", e);
        }
    }

    async getTimerList({ day, time, partition }) {
        try {
            const list = [];
            // query timer table
            let query = `SELECT id, owner, timer, start, subscription FROM ${this.keyspace}.${this.timerTable} `;
            query += ` WHERE day = :day AND time = :time AND partition = :partition;`;
            const params = {
                day,
                time,
                partition
            }
            let result = await this.cassandra.execute(query,params,{ prepare: true});
            for (const row of result) {
                list.push({
                    day,
                    time,
                    id: row.get("id").toString(),
                    owner: row.get("owner").toString(),
                    timer: row.get("timer"),
                    start: row.get("start"),
                    subscription: row.get("subscription")
                });
            }
            return list;
        } catch (e) {
            this.logger.warn("DB: failed to retrieve timers", { e });
            throw new Error("DB: failed to retrieve timers", e);
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

        /* unique key table
            - storing unique keys for foreign keys
            - hash is calculated from key
         */
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.uniqueKeyTable} 
                    ( hash varchar, uid uuid, PRIMARY KEY (hash) )
                    WITH comment = 'storing foreign unique keys';`;
        await this.cassandra.execute(query);

        /* active instances
            - for fully sepcified access only
            - always latest snapshot and version
         */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.instanceTable} `;
        query += " ( owner uuid, instance uuid, process uuid, processversion uuid, version int, snapshot varchar, PRIMARY KEY ((owner,instance)) ) ";
        query += " WITH comment = 'process instances';";
        await this.cassandra.execute(query);

        /* process version table 
            - with parsed process and xml original 
            - with partition key ownerId + processId 
        */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.versionTable} `;
        query += " ( owner uuid, process uuid, version uuid, deployed timestamp, attributes varchar, xml varchar, parsed varchar, PRIMARY KEY ((owner,process),version) ) ";
        query += " WITH comment = 'process versions';";
        await this.cassandra.execute(query);

        /* active version table with running instances
            -  for access with partition key ownerId and cluster key processId 
            - versions are stored as a map with versionId as key and timestamp as value
            - active instances are stored as a map with instanceId as key and versionId as value
         */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.activeTable} `;
        query += " ( owner uuid, process uuid, version uuid, activated timestamp, versions map<uuid,timestamp>, attributes varchar, active map<uuid,uuid>, PRIMARY KEY ((owner),process) ) ";
        query += " WITH comment = 'active process versions and instances';";
        await this.cassandra.execute(query);

        /* finished instances
            - stored under the partition key ownerId and day
            - cluster key is instanceId
         */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.finishedTable} `;
        query += " ( owner uuid, day date, instance uuid, process uuid, processversion uuid, version int, completed boolean, snapshot varchar, PRIMARY KEY ((owner,day),instance) ) ";
        query += " WITH default_time_to_live = 804800 AND comment = 'finished process instances stored for 10 days';";
        await this.cassandra.execute(query);

        /* subscriptions 
            - stored under the partion key owner + type + hash
            - can be accessed therefore only fully specified 
        */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.subscriptionTable} `;
        query += " ( owner uuid, type varchar, hash varchar, subscription map<uuid,varchar>, PRIMARY KEY ((owner,type,hash)) ) ";
        query += " WITH comment = 'event, message, timer and signal subscriptions';";
        await this.cassandra.execute(query);

        /* timers 
            - stored under the partition key day + time + partition
            - cluster key is id
            - timer and subscription are encrypted
         */
        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.timerTable} `;
        query += " ( day date, time time, partition int, id uuid, owner uuid, timer varchar, start boolean, subscription varchar, PRIMARY KEY ((day, time, partition), id) ) ";
        query += " WITH comment = 'stored timer of processes and instances';";
        await this.cassandra.execute(query);

        /* objects like events, messages, jobs, commits are stored encrypted for 10 days under the partion key owner + objectId
            - objects are stored directly after they have been received for further processing by the queue workers
            - 10 days is the time frame buffer for the object to be processed by the queue workers
        */
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
 
