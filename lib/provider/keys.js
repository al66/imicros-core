/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraKeys");
const { Keys: KeysClass } = require("../classes/util/keys");

const Keys = {

    /**
     * Methods
     */
    methods: {},

    /**
     * Service created lifecycle event handler
     */
    async created() {

        if (!this.vault) throw new Error("Vault provider must be injected first");

        this._keys = {
            db: new DB({
                logger: this.broker.logger,
                options: { 
                    contactPoints: this.settings?.keys?.db?.contactPoints || "127.0.0.1", 
                    datacenter: this.settings?.keys?.db?.datacenter || "datacenter1", 
                    keyspace: this.settings?.keys?.db?.keyspace || "imicros_auth",
                    keysTable: this.settings?.keys?.db?.keysTable || "appkeys"
                }
            })
        };

        const options = {
            owner: {
                token: this.settings?.keys?.owner?.token
            },
            key: {
                len: this.settings?.keys?.key?.len || 32,
                expirationDays: this.settings?.keys?.key?.expirationDays || 30,
            }
        }
        this.keys = new KeysClass({ broker: this.broker, options, db: this._keys.db, vault: this.vault });
        

    },

    async started () {
        await this._keys.db.connect();
    },

    async stopped () {
        await this._keys.db.disconnect();
    }

} 
 
module.exports = {
   Keys
}