/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { DB } = require("../db/cassandraVault");
const crypto = require("crypto");
const secrets = require("secrets.js-grempe");
const jwt = require("jsonwebtoken");
const { actions } = require("./users");

/** Actions */
// init { token } => { shares } 
// getToken { share } => { token }
// unseal { nodeID, token, share } => { received }
// isSealed => true|false
// getSealed { token } => { sealed:Array<String> }
// hash { key, extension } => masterKey  - only local calls!

module.exports = {
    name: "vault",

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
         * init
         * 
         * @actions
         *
         * @param {String} token - master token
         * 
         * @returns {Object} { shares } 
         */
        init: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                if (this.masterKey) throw new Error("master is already unsealed");

                if (ctx.params.token !== this.masterToken) throw new Error("invalid token");

                const check = await this.db.checkHashes();
                if (!check) throw new Error("this method can only be called once"); 

                // generate a 512-bit key
                const key = secrets.random(512); // => key is a hex string

                // split into 5 shares with a threshold of 3
                const shares = secrets.share(key, 5, 3);      
                const hashes = shares.map((value) => crypto.createHash("sha256")
                    .update(value)
                    .digest("hex"));
                
                // avoid second call and save hashes
                await this.db.storeHashes({ hashes });
                this.logger.info("init called");
                
                return {
                    shares: shares
                };
            }
        },
        
        /**
         * new share
         * 
         * @actions
         *
         * @param {String} token - master token
         * @param {Number} index - index of share to create
         * @param {Array<String>} shares - array of minimum required shares
         * 
         * @returns {String} { share } 
         */
        newShare: {
            acl: {
                before: true,
                onlyAdminGroup: true
            },
            params: {
                token: { type: "string" },
                index: { type: "number" },
                shares: { type: "array", items: "string" }
            },
            async handler(ctx) {
                if (ctx.params.token !== this.masterToken) throw new Error("invalid token");

                // create new share
                const newShare = secrets.newShare( ctx.params.index, ctx.params.shares );
                const hash = crypto.createHash("sha256")
                    .update(newShare)
                    .digest("hex");

                // update init.conf file
                try {
                    const { hashes } = await this.db.readHashes() || [];
                    hashes[ctx.params.index] = hash;
                    await this.db.storeHashes({ hashes });
                } catch (err) {
                    this.logger.error("Failed to read hashes", err);
                    throw new Error("Failed to read hashes");
                }
                
                return {
                    share: newShare
                };
            }
        },
        
        getToken: {
            params: {
                share: { type: "string" }
            },
            async handler(ctx) {

                let hash = crypto.createHash("sha256")
                    .update(ctx.params.share)
                    .digest("hex");
                let test = this.encrypt(crypto.randomBytes(32).toString("hex")); // encrypt unvalid key
                try {
                    const { hashes } = await this.db.readHashes() || [];
                    if (hashes.indexOf(hash) < 0) {
                        this.logger.warning("call to getToken with unvalid share", hash);
                    } else {
                        test = this.encrypt(this.masterToken);  // encrypt valid key
                    }
                } catch (err) {
                    this.logger.error("Failed to read hashes", err);
                    throw new Error("Failed to read hashes");
                }
                
                let token = this.signedJWT({ type: "unseal_token", test });
                return { token };
            }
        },

        /**
         * commit share for unsealing 
         * 
         * @actions
         *
         * @param {String} nodeID
         * @param {String} share
         * 
         * @returns {Object} { received } 
         */
        unseal: {
            params: {
                nodeID: { type: "string" },
                share: { type: "string" }
            },
            async handler(ctx) {
                // pass through
                if (ctx.params.nodeID !== this.broker.nodeID) return this.broker.call(ctx.action.name, ctx.params, { nodeID: ctx.params.nodeID });

                if (this.masterKey) throw new Error("master is already unsealed");

                let hash = crypto.createHash("sha256")
                    .update(ctx.params.share)
                    .digest("hex");
                const { hashes } = await this.readHashes();
                if (hashes.indexOf(hash) < 0) {
                    this.logger.warn("call to unseal with unvalid share", hash);
                    throw new Error("Invalid share");
                }

                let components = secrets.extractShareComponents(ctx.params.share);
                if (!components.id) throw new Error("unvalid share");

                if (!this.shares) this.shares = new Set();
                this.shares.add(ctx.params.share);
                
                if (this.shares.size >= 3) {
                    this.masterKey = secrets.combine(Array.from(this.shares));
                    
                    // create unsealed service
                    await this.startUnsealedService(ctx);
                }
                return {
                    received: this.shares.size
                };
            }
        },

        /**
         * verify token
         * 
         * @actions
         * 
         * @param {String} token - retrieved token from action getToken
         * 
         * @returns { valid: true | false } 
         */
        verify: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                try {
                    jwt.verify(ctx.params.token, this.masterToken);
                    return { valid: true };
                } catch(err) {
                    return { valid: false };
                }
            }
        },

        /**
         * node is sealed
         * 
         * @actions
         * 
         * @returns {Boolean} true | false 
         */
        isSealed: {
            visibility: "public",
            handler(/*ctx*/) {
                return this.masterKey && this.masterKey.length && this.masterKey.length > 0 ? false : true;
            }
        },

        /**
         * get sealed nodes 
         * 
         * @actions
         *
         * @param {String} token - retrieved token from action getToken
         * 
         * @returns {Object} { sealed } - array nodeID's of sealed nodes
         */
        getSealed: {
            params: {
                token: { type: "string" }
            },
            async handler(ctx) {
                let decoded = jwt.verify(ctx.params.token, this.masterToken);
                if (decoded.type !== "unseal_token" || !decoded.test ) throw new Error("token not valid");

                let check = this.decrypt(decoded.test);
                if (check !== this.masterToken ) return { sealed: [] };


                let sealed = [];
                let unsealed = [];
                let services = await this.broker.call("$node.services", { onlyAvailable: true });
                await Promise.all(services.map(async (service) => {
                    if (service.fullName === ctx.service.fullName) {
                        let nodes = Array.isArray(service.nodes) ? service.nodes : [];
                        if (nodes.length < 1 && service.nodeID) nodes.push(service.nodeID);
                        await Promise.all(nodes.map(async (node) => {
                            let check = await this.broker.call(ctx.service.fullName + ".isSealed",{},{ nodeID: node });
                            if (check) { 
                                sealed.push(node) ;
                            } else {
                                unsealed.push(node);
                            }
                        }));
                    }
                }));
                return { sealed };
            }
        },
        
        /**
         * hash key with master key
         * 
         * @actions
         *
         * @param {String} key - key to be hashed
         * @param {String} extension - optional: used as part of hash secret together with the master key
         * 
         * @returns {String} hashed key -  as hex
         */
        hash: {
            visibility: "public",
            params: {
                key: { type: "string"},
                extension: { type: "string", optional: true, default: "" }
            },
            handler(ctx) {
                if (!this.masterKey) {
                    //TODO try to call another node // -> async ... like in get sealed

                    throw new Error("still sealed");
                }
                const extension = ctx.params.extension || "";
                return crypto.createHmac("sha256", this.masterKey+extension)
                .update(ctx.params.key)
                .digest("hex");
            }
        }
    },
     
    /**
     * Events
     */
    events: {
    },
 
    /**
     * Methods
     */
    methods: {
        /**
          * Generate a signed JWT token
          * 
          * @param {Object} payload 
          * 
          * @returns {String} Signed token
          */
        signedJWT(payload) {
            let today = new Date();
            let exp = new Date(today);
            exp.setDate(today.getDate() + 60);
            payload.exp = Math.floor(exp.getTime() / 1000);
 
            return jwt.sign(payload, this.masterToken);
        },
         
        encrypt (value = ".") {
            try {
                let iv = crypto.randomBytes(this.encryption.ivlen);
                let key = crypto.pbkdf2Sync(this.masterToken, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
                let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
                let encrypted = cipher.update(value, "utf8", "hex");
                encrypted += cipher.final("hex");
                return iv.toString("hex") + "~" + encrypted;
            } catch (err) {
                this.logger.warn("encryption failed", err);
                return ".~.";
            }
        },

        decrypt (encrypted) {
            try {
                let parts = encrypted.split("~");
                let iv = Buffer.from(parts[0], "hex");
                let key = crypto.pbkdf2Sync(this.masterToken, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
                let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
                let decrypted = decipher.update(parts[1], "hex", "utf8");
                decrypted += decipher.final("utf8");
                return decrypted;            
            } catch (err) {
                this.logger.warn("decryption failed", err);
                return "unvalid";
            }
        },
        
        async readHashes() {
            try {
                const { hashes = [] } = await this.db.readHashes();
                return { hashes };
            } catch (err) {
                this.logger.error("Failed to read hashes", err);
                throw new Error("Failed to read hashes");
            }
        },

        /**
         * start unsealed service (as trigger for vault dependent services)
         * 
         * @methods
         *
         * @param {Context} ctx
         * 
         */
        async startUnsealedService(ctx) {
            // create unsealed service
            const service = await ctx.broker.createService({ 
                name: this.nameUnsealedService
            });
            service._start();
            await ctx.broker.waitForServices([this.nameUnsealedService]);
            this.logger.info("unsealed service created", { service: this.nameUnsealedService });
        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() {

        // only used once to call init method
        this.masterToken = process.env.MASTER_TOKEN;

        // master key - result of unseal process
        this.masterKey = null;

        // encryption setup
        this.encryption = {
            iterations: 1000,
            ivlen: 16,
            keylen: 32,
            digest: "sha512"
        };

        // name of unsealed service (dummy to check, if node is unsealed)
        this.nameUnsealedService = this.settings.service?.unsealed || "unsealed",

        this.db = new DB({
            logger: this.broker.logger,
            options: this.settings?.db || {}
        });

    },

    /**
     * Service started lifecycle event handler
     */
    async started () {
        await this.db.connect();
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        await this.db.disconnect();
    }

};
