/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraKeys");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");

module.exports = {
    name: "keys",
    version: 1,    

    /**
     * Service settings
     */
    settings: {},

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    dependencies: [],

    /**
     * Actions
     */
    actions: {

        /**
         * read key chain for owner 
         * 
         * @actions
         * @param {string} owner - owner of the key chain
         * 
         * @returns {object} result - { keys }
         */
        readKeys: {
            visibility: "public",
            params: {
                owner: { type: "string" }
            },
            async handler(ctx) {
                try {
                    const result = await this.db.readKeys({ owner: ctx.params.owner });
                    return result;
                } catch (err) /* istanbul ignore next */ {
                    this.logger.error("Database error", { error: err.message, owner: ctx.params.owner });
                    throw new Error("Failed to retrieve keys");
                }
            }
        },

        /**
         * add a new key to the key chain for owner  
         * 
         * @actions
         * @param {string} owner - owner of the key chain
         * 
         * @returns {boolean} success - true if successful
         */
        newKey: {
            visibility: "public",
            params: {
                owner: { type: "string" }
            },
            async handler(ctx) {
                // create a new key
                const iat = new Date().getTime();
                const params = {
                    owner: ctx.params.owner, 
                    id: uuid(), 
                    key: crypto.randomBytes(this.keyLen).toString("hex"),
                    iat, 
                    exp: iat + ( 1000 * 60 * 60 * 24 * this.expirationDays ) // add x days
                }
                try {
                    const success = await this.db.newKey(params);
                    return success;
                } catch (err) /* istanbul ignore next */ {
                    this.logger.error("Database error", {  owner: ctx.params.owner });
                    throw new Error("Failed to create new encryption key");
                }
            }
        }

    },

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {

    },

    /**
     * Service created lifecycle event handler
     */
    created() {

        this.db = new DB({
            logger: this.broker.logger,
            options: {
                contactPoints: this.settings?.db?.contactPoints || process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1",
                datacenter: this.settings?.db?.datacenter || process.env.CASSANDRA_DATACENTER || "datacenter1",
                keyspace: this.settings?.db?.keyspace || process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
                keysTable: this.settings?.db?.keysTable || "servicekeys"
            }
        });

        // key length
        this.keyLen = this.settings?.key?.len || 32;

        // expires after x days
        this.expirationDays = this.settings?.key?.expirationDays || 30;

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
        await this.db.connect();
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        await this.db.disconnect();
    }

};