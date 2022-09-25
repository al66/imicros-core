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

        query = `CREATE TABLE IF NOT EXISTS ${this.keyspace}.${this.agentTable} 
                    ( group uuid, agent uuid, attribute varchar, value varchar, PRIMARY KEY ((group), agent, attribute) )
                     WITH comment = 'storing agents';`;
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

    getAgentInterface () {
        return new Agent({ cassandra: this.cassandra, encryption: this.encryption, logger: this.logger, table: this.agentTable  });
    }

    /** Database specfic methods */

};

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
            data[this.encryption.getHash(key)] = key;
            const queries = [];
            for (const [attribute, value] of Object.entries(data)) {
                const condition =  attribute === "id" ? "IF NOT EXISTS " : "";
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
 