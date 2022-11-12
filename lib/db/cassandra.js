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
        this.contactPoints = ( options.contactPoints ?? "127.0.0.1" ).split(",");
        this.datacenter = options.datacenter ?? "datacenter1";
        this.keyspace = options.keyspace ?? "imicros_auth";
        this.userTable = options.userTable ?? "user";
        this.agentTable = options.agentTable ?? "agents";
        this.groupTable = options.groupTable ?? "groups";
        this.grantTable = options.grantTable ?? "grants";
        this.relationTable = options.relationTable ?? "relations";
        this.invitationTable = options.invitationTable ?? "invitations";
        this.eventTable = options.eventTable ?? "event";
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
 
    /** called in service created */
    async init () {

    }

    /** called in service started */
    async connect () {

        // connect to cassandra cluster
        await this.cassandra.connect();
        this.logger.info("Connected to cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
        // create tables, if not exists
        let query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.userTable} 
                    ( key varchar, attribute varchar, value varchar, PRIMARY KEY ((key), attribute) )
                     WITH comment = 'storing users';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.groupTable} 
                    ( group uuid, attribute varchar, value varchar, PRIMARY KEY ((group), attribute) )
                     WITH comment = 'storing groups';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.grantTable} 
                    ( group uuid, entity uuid, attribute varchar, value varchar, PRIMARY KEY ((group), entity, attribute) )
                     WITH comment = 'storing grants for group access';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.invitationTable} 
                    ( group uuid, key varchar, value varchar, PRIMARY KEY ((group), key) )
                     WITH comment = 'storing invitations for a group';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.relationTable} 
                    ( key varchar, group uuid, attribute varchar, value varchar, PRIMARY KEY ((key), group, attribute) )
                     WITH comment = 'storing relations';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.agentTable} 
                    ( group uuid, agent uuid, attribute varchar, value varchar, PRIMARY KEY ((group), agent, attribute) )
                     WITH comment = 'storing agents';`;
        await this.cassandra.execute(query);

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.eventTable} 
                    ( uid uuid, timeuuid timeuuid, version bigint, value varchar, PRIMARY KEY ((uid), timeuuid) )
                     WITH comment = 'storing events';`;
         await this.cassandra.execute(query);

    }
    
    /** called in service stopped */
    async disconnect () {

        // close all open connections to cassandra
        await this.cassandra.shutdown();
        this.logger.info("Disconnected from cassandra", { contactPoints: this.contactPoints, datacenter: this.datacenter, keyspace: this.keyspace });
        
    } 

    /** interfaces */
    getUserInterface () {
        return new User({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.userTable  });
    }

    getGroupInterface () {
        return new Group({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.groupTable  });
    }

    getRelationInterface () {
        return new Relation({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.relationTable  });
    }

    getGrantsInterface () {
        return new Grants({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.grantTable  });
    }

    getInvitationInterface () {
        return new Invitation({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.invitationTable  });
    }

    getAgentInterface () {
        return new Agent({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.agentTable  });
    }

    getCQRSInterface () {
        return new CQRS({ 
            cassandra: this.cassandra, 
            encryption: this.encryption, 
            logger: this.logger, 
            tables: {
                event: this.eventTable
            }
        });
    }

    /** Database specfic methods */

};

class CQRS {
    constructor ({ cassandra, encryption, logger, tables }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.eventTable = tables.event;
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
                        returnValue.events.push({
                            timeuuid: row.get("timeuuid").toString(),
                            event: decrypted
                        })
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
                        returnValue.events.push({
                            timeuuid: row.get("timeuuid").toString(),
                            event: decrypted
                        })
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
}

class User {
    constructor ({ cassandra, encryption, logger, table }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.table = table;
    }

    async add ({ key, data }) {
        if (!data.hasOwnProperty("id")) return null;
        try {
            const hashedKey = this.encryption.getHash(key);
            data[hashedKey] = key;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === hashedKey ? "IF NOT EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `INSERT INTO ${this.table} (key,attribute,value) VALUES (:key,:attribute,:value) ${condition};`;
                const params = { 
                    key: this.encryption.getHash(key), 
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("add user result", key, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to insert user", { key, e });
            throw new Error("DB: failed to insert user", e);
        }
    }
    
    async update({ key, data }) {
        if (Object.entries(data).length === 0) return null;
        try {
            const hashedKey = this.encryption.getHash(key);
            data[hashedKey] = key;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === hashedKey ? "IF EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `UPDATE ${this.table} SET value = :value WHERE key = :key AND attribute = :attribute ${condition};`;
                const params = { 
                    key: this.encryption.getHash(key), 
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("update user result", key, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to update user", { key, e });
            throw new Error("DB: failed to update user", e);
        }
    }

    async get ({ key }) {
        try {
            const returnValue = {
                key
            };
            // read attributes from db            
            const query = `SELECT key,attribute,value FROM ${this.table} WHERE key = :key;`;
            const params = { 
                key: this.encryption.getHash(key)
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                const decrypted = await this.encryption.decryptData(value);
                returnValue[decrypted.attribute] = decrypted.value;
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query user", { key, e });
            throw new Error("DB: failed to query user", e);
        }
    }

    async delete({ key }) {

    }

}

class Group {
    constructor ({ cassandra, encryption, logger, table }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.table = table;
    }

    async add ({ groupId, data }) {
        try {
            data.id = groupId;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === "id" ? "IF NOT EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `INSERT INTO ${this.table} (group,attribute,value) VALUES (:group,:attribute,:value) ${condition};`;
                const params = { 
                    group: groupId, 
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("add group result", groupId, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to insert group", { groupId, e });
            throw new Error("DB: failed to insert group", e);
        }
    }
    
    async update({ groupId, data }) {
        if (Object.entries(data).length === 0) return null;
        try {
            data.id = groupId;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === "id" ? "IF EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `UPDATE ${this.table} SET value = :value WHERE group = :group AND attribute = :attribute ${condition};`;
                const params = { 
                    group: groupId, 
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("update group result", groupId, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to update group", { groupId, e });
            throw new Error("DB: failed to update group", e);
        }
    }

    async get ({ groupId }) {
        try {
            const returnValue = {};
            // read attributes from db            
            const query = `SELECT group,attribute,value FROM ${this.table} WHERE group = :group;`;
            const params = { 
                group: groupId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                const decrypted = await this.encryption.decryptData(value);
                returnValue[decrypted.attribute] = decrypted.value;
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query group", { groupId, e });
            throw new Error("DB: failed to query group", e);
        }
    }

    async delete({ groupId }) {

    }

}

class Grants {
    constructor ({ cassandra, encryption, logger, table }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.table = table;
    }

    async add ({ groupId, entityId, data }) {
        try {
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `INSERT INTO ${this.table} (group,entity,attribute,value) VALUES (:group,:entity,:attribute,:value);`;
                const params = { 
                    group: groupId, 
                    entity: entityId,
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            await this.cassandra.batch(queries, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to add grant", { groupId, entityId, e });
            throw new Error("DB: failed to add grant", e);
        }
    }

    async get ({ groupId, entityId }) {
        try {
            const returnValue = {};
            // read attributes from db            
            const query = `SELECT group,entity,attribute,value,TTL(value) FROM ${this.table} WHERE group = :group AND entity = :entity;`;
            const params = { 
                group: groupId,
                entity: entityId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                if (value) {
                    const decrypted = await this.encryption.decryptData(value);
                    returnValue[decrypted.attribute] = decrypted.value;
                }
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query grant", { key, groupId, e });
            throw new Error("DB: failed to query grant", e);
        }
    }
    
    async update ({ groupId, entityId, data }) {
        if (Object.entries(data).length === 0) return null;
        try {
            const queries = [];
            delete data.mail;       // mail may not be updated!
            for (const [attribute, value] of Object.entries(data)) {
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `UPDATE ${this.table} SET value = :value WHERE group = :group AND entity = :entity AND attribute = :attribute;`;
                const params = { 
                    group: groupId, 
                    entity: entityId,
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            await this.cassandra.batch(queries, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to update grant", {groupId, entityId, e });
            throw new Error("DB: failed to update grant", e);
        }
    }

    async getAll ({ groupId }) {
        try {
            const returnValue = {
                groupId,
                grants: {}
            };
            // read attributes from db            
            const query = `SELECT group, entity, attribute, value, ttl(value) FROM ${this.table} WHERE group = :group;`;
            const params = { 
                group: groupId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                if (value) {
                    const entity = row.get("entity");
                    if (!returnValue.grants[entity]) returnValue.grants[entity] = {};
                    const decrypted = await this.encryption.decryptData(value);
                    returnValue.grants[entity][decrypted.attribute] = decrypted.value;
                    const ttl = row.get("ttl(value)");
                    if (!returnValue.grants[entity].ttl || returnValue.grants[entity].ttl < ttl) returnValue.grants[entity].ttl = ttl;
                }
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query grants", { groupId, e });
            throw new Error("DB: failed to query grants", e);
        }
    }

    async remove({ groupId, entityId }) {
        try {
            const query = `DELETE FROM ${this.table} WHERE group = :group AND entity = :entity;`;
            const params = { 
                group: groupId, 
                entity: entityId
            };
            await this.cassandra.execute(query, params, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to remove the grant", { groupId, entityId, e });
            throw new Error("DB: failed to remove the grant", e);
        }
    }

}

class Invitation {
    constructor ({ cassandra, encryption, logger, table }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.table = table;
        this.ttl = 1209600;       "14 days"
    }

    async add({ groupId, key, data }) {
        try {
            const encrypted = await this.encryption.encryptData(data);
            // insert db            
            const query = `UPDATE ${this.table} SET value = :value WHERE group = :group AND key = :key;`;
            const params = { 
                key,
                group: groupId, 
                value: encrypted
            };
            await this.cassandra.execute(query, params, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to add invitation", { key, groupId, e });
            throw new Error("DB: failed to add invitation", e);
        }
    }

    async get({ groupId, key }) {
        try {
            const query = `SELECT group,key,value FROM ${this.table} WHERE group = :group AND key = :key;`;
            const params = { 
                group: groupId,
                key
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            let row = result.first();
            if (row) {
                const value = row.get("value");
                const decrypted = await this.encryption.decryptData(value);
                return decrypted;
            }
            return null;
        } catch (e) {
            this.logger.warn("DB: failed to query invitations", { groupId, e });
            throw new Error("DB: failed to query invitations", e);
        }
    }

    async remove({ groupId, key }) {
        try {
            const query = `DELETE FROM ${this.table} WHERE group = :group AND key = :key;`;
            const params = { 
                group: groupId,
                key
            };
            await this.cassandra.execute(query, params, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to remove the invitation", { groupId, key, e });
            throw new Error("DB: failed to remove the invitation", e);
        }
    }

    async getAll({ groupId }) {
        try {
            const returnValue = [];
            // read attributes from db            
            const query = `SELECT group,key,value FROM ${this.table} WHERE group = :group;`;
            const params = { 
                group: groupId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                const decrypted = await this.encryption.decryptData(value);
                returnValue.push(decrypted);
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query invitations", { groupId, e });
            throw new Error("DB: failed to query invitations", e);
        }
    }

}
class Relation {
    constructor ({ cassandra, encryption, logger, table }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.table = table;
        this.ttl = 31536000;       "1 year"
    }

    async add ({ key, groupId, data }) {
        try {
            data.groupId = groupId;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === "groupId" ? "IF NOT EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `INSERT INTO ${this.table} (key,group,attribute,value) VALUES (:key,:group,:attribute,:value) ${condition}  USING TTL ${this.ttl};`;
                const params = { 
                    key,
                    group: groupId, 
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("add relation result", key, groupId, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to insert relation", { key, groupId, e });
            throw new Error("DB: failed to insert relation", e);
        }
    }

    async get ({ key, groupId }) {
        try {
            const returnValue = {};
            // read attributes from db            
            const query = `SELECT key,group,attribute,value,TTL(value) FROM ${this.table} WHERE key = :key AND group = :group;`;
            const params = { 
                key,
                group: groupId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                if (value) {
                    const decrypted = await this.encryption.decryptData(value);
                    returnValue[decrypted.attribute] = decrypted.value;
                }
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query relation", { key, groupId, e });
            throw new Error("DB: failed to query relation", e);
        }
    }

    async update({ key, groupId, data }) {
        if (Object.entries(data).length === 0) return null;
        try {
            data.groupId = groupId;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === "groupId" ? "IF EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `UPDATE ${this.table} SET value = :value WHERE key = :key AND group = :group AND attribute = :attribute ${condition};`;
                const params = { 
                    key,
                    group: groupId, 
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("update relation result", key, groupId, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to update relation", { key, groupId, e });
            throw new Error("DB: failed to update relation", e);
        }
    }

    async remove({ key, groupId }) {
        try {
            const query = `DELETE FROM ${this.table} WHERE key = :key AND group = :group;`;
            const params = { 
                group: groupId,
                key
            };
            await this.cassandra.execute(query, params, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to remove the relation", { groupId, key, e });
            throw new Error("DB: failed to remove the relation", e);
        }
    }

    async getAll({ key }) {
        try {
            const returnValue = {
                key,
                relations: {}
            };
            // read attributes from db            
            const query = `SELECT key, group, attribute, value, ttl(value) FROM ${this.table} WHERE key = :key;`;
            const params = { 
                key
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                if (value) {
                    const groupId = row.get("group");
                    if (!returnValue.relations[groupId]) returnValue.relations[groupId] = {};
                    const decrypted = await this.encryption.decryptData(value);
                    returnValue.relations[groupId][decrypted.attribute] = decrypted.value;
                    const ttl = row.get("ttl(value)");
                    if (!returnValue.relations[groupId].ttl || returnValue.relations[groupId].ttl < ttl) returnValue.relations[groupId].ttl = ttl;
                }
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query relations", { key, e });
            throw new Error("DB: failed to query relations", e);
        }
    }

    async setTTL({ key, groupId, ttl }) {
        try {
            // read attributes from db            
            const query = `SELECT key, group, attribute, value, TTL(value) FROM ${this.table} WHERE key = :key AND group = :group;`;
            const params = { 
                key,
                group: groupId
            };
            let result = await this.cassandra.execute(query, params, {prepare: true}); 
            const queries = [];
            for (const row of result) {
                const value = row.get("value");
                // update ttl            
                if (value) {
                    const query = `UPDATE ${this.table} USING TTL ${ttl} SET value = :value WHERE key = :key AND group = :group AND attribute = :attribute;`;
                    const params = { 
                        key: row.get("key"),
                        group: row.get("group"), 
                        attribute: row.get("attribute"),
                        value: row.get("value")
                    };
                    queries.push({ query, params});
                }
            }
            await this.cassandra.batch(queries, {prepare: true}); 
            return true;
        } catch (e) {
            this.logger.warn("DB: failed to set ttl on relation", { key, groupId, ttl, e });
            throw new Error("DB: failed to set ttl on relation", e);
        }
    }

    
}

class Agent {
    constructor ({ cassandra, encryption, logger, table }) {
        this.cassandra = cassandra;
        this.encryption = encryption;
        this.logger = logger;
        this.table = table;
    }

    async add({ ownerId, agentId, data }) {
        if (!agentId || !ownerId) return null;
        try {
            data.id = agentId;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const encrypted = await this.encryption.encryptData({ attribute, value });
                const condition =  attribute === "id" ? "IF NOT EXISTS " : "";
                // insert db            
                const query = `INSERT INTO ${this.table} (group,agent,attribute,value) VALUES (:group,:agent,:attribute,:value) ${condition};`;
                const params = { 
                    group: ownerId, 
                    agent: agentId,
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("add agent result", ownerId, agentId, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to insert agent", { key, e });
            throw new Error("DB: failed to insert agent", e);
        }
    }

    async update({ ownerId, agentId, data }) {
        if (Object.entries(data).length === 0) return null;
        try {
            data.id = agentId;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === "id" ? "IF EXISTS " : "";
                const encrypted = await this.encryption.encryptData({ attribute, value });
                // insert db            
                const query = `UPDATE ${this.table} SET value = :value WHERE group = :group AND agent = :agent AND attribute = :attribute ${condition};`;
                const params = { 
                    group: ownerId, 
                    agent: agentId,
                    attribute: this.encryption.getHash(attribute),
                    value: encrypted
                };
                queries.push({ query, params});
            }
            const result = await this.cassandra.batch(queries, {prepare: true}); 
            let applied = false;
            const row = result.first();
            if (row) applied = row.get("[applied]");
            this.logger.debug("update agent result", ownerId, agentId, applied);
            return applied;
        } catch (e) {
            this.logger.warn("DB: failed to update agent", { ownerId, agentId, e });
            throw new Error("DB: failed to update agent", e);
        }
    }

    async delete({ ownerId, agentId }) {

    }

    async get({ ownerId, agentId }) {
        try {
            const returnValue = {
                ownerId
            };
            // read attributes from db            
            const query = `SELECT group, agent, attribute,value FROM ${this.table} WHERE group = :group AND agent = :agent;`;
            const params = { 
                group: ownerId, 
                agent: agentId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const value = row.get("value");
                const decrypted = await this.encryption.decryptData(value);
                returnValue[decrypted.attribute] = decrypted.value;
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query agent", { ownerId, agentId, e });
            throw new Error("DB: failed to query agent", e);
        }
    }

    async getAll({ ownerId }) {
        try {
            const returnValue = {
                ownerId,
                agents: {}
            };
            // read attributes from db            
            const query = `SELECT group, agent, attribute,value FROM ${this.table} WHERE group = :group;`;
            const params = { 
                group: ownerId
            };
            const result = await this.cassandra.execute(query, params, {prepare: true}); 
            for (const row of result) {
                const agentId = row.get("agent");
                if (!returnValue.agents[agentId]) returnValue.agents[agentId] = {};
                const value = row.get("value");
                const decrypted = await this.encryption.decryptData(value);
                returnValue.agents[agentId][decrypted.attribute] = decrypted.value;
            }
            return returnValue;
        } catch (e) {
            this.logger.warn("DB: failed to query agent", { ownerId, e });
            throw new Error("DB: failed to query agent", e);
        }
    }

}

module.exports = {
    DB
};
 