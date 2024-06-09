"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/* Vault Service for tests woithout unseal logic */

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
        },

        /**
         * sign a token
         * 
         * @actions
         *
         * @param {Object} payload - payload to be signed
         * @param {Object} options - optional: any options allowed by jwt.sign
         * 
         * @returns {Object} { token } -  signed token
         */
        signToken: {
            visibility: "public",
            params: {
                payload: { type: "object"},
                options: { type: "object", optional: true, default: {} }
            },
            handler(ctx) {
                return { token: jwt.sign(ctx.params.payload, this.masterKey ,ctx.params.options) };
            }
        },
    
        /**
         * verify a token
         * 
         * @actions
         *
         * @param {Object} payload - payload to be signed
         * @param {Object} options - optional: any options allowed by jwt.sign
         * 
         * @returns {Object} { payload } -  decoded payload
         */
        verifyToken: {
            visibility: "public",
            params: {
                token: { type: "string"}
            },
            handler(ctx) {
                try{
                    return { payload: jwt.verify(ctx.params.token, this.masterKey) };
                } catch (err) {
                    throw new Error("no valid token");
                }
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

        // master key - result of unseal process
        this.masterKey = this.settings.masterKey || null;

        // encryption setup
        this.encryption = {
            iterations: 1000,
            ivlen: 16,
            keylen: 32,
            digest: "sha512"
        };

        // name of unsealed service (dummy to check, if node is unsealed)
        this.nameUnsealedService = this.settings.service?.unsealed || "unsealed";

    },

    /**
     * Service started lifecycle event handler
     */
    async started () {

        if(!this.masterKey) {
            this.logger.error("vault sealed - master key missing");
            throw new Error("vault sealed - master key missing");
        }   

        // create unsealed service
        await this.startUnsealedService(this);

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
    }

};
