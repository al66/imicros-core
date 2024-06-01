/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Interpreter } = require("imicros-feel-interpreter");
const { DMNConverter } = require("imicros-feel-interpreter");
const { DB } = require("../classes/db/cassandraBusinessRules");

module.exports = {
    name: "businessRules",

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
         * deploy a business rule (DMN file)
         * 
         * @actions
         * @param {string} objectName   - path to dmn file in store
         * 
         * @returns {boolean} result 
         */
        deploy: {
            acl: {
                before: true
            },
            params: {
                objectName: { type: "string" }
            },			
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const xml = await this.store.getObject({ctx: ctx, objectName: ctx.params.objectName });
                const decision = this.convert({ xml });
                // parse
                const result = this.parse({ expression: decision.expression });
                await this.db.save({ 
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken, 
                    xmlData: xml, 
                    parsed: {
                        id: decision.id,
                        name: decision.name,
                        ast: result.ast 
                    }
                });
                return true;
            }
        },

        /**
         * get a stored business rule
         * 
         * @actions
         * @param {string} businessRuleId - stored decision id
         * 
         * @returns {object} decision { businessRuleId, xmlData, parsed } 
         */
        get: {
            acl: {
                before: true
            },
            params: {
                businessRuleId: { type: "string" }
            },			
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                return await this.db.get({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, businessRuleId: ctx.params.businessRuleId, xml: true });
            }
        },

        /**
         * evaluate either an expression, a DMN file (as xml string) or a stored xml with the given context 
         * 
         * @actions
         * @param {string} businessRuleId    - stored decision id
         * @param {object} context       - given context for the expression to be evaluated
         * 
         * @returns {string|boolean|number|object} result 
         */
        evaluate: {
            acl: {
                before: true
            },
            params: {
                businessRuleId: { type: "string" },
                context: { type: "object" }
            },			
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const decision =  await this.db.get({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, businessRuleId: ctx.params.businessRuleId });
                if (!decision?.parsed?.ast) throw new Error("Decision not found");
                return this.evaluate({ ast: decision.parsed.ast, context: ctx.params.context });
            }
        },

        /**
         * get list of stored decisions
         * 
         * @actions
         * 
         * @returns {object[]} array of decisions { businessRuleId }
         */
        getList: {
            acl: {
                before: true
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                return this.db.getList({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken });
            }
        },

        /**
         * delete a decision
         * 
         * @actions
         * @param {string} businessRuleId - stored decision id
         * 
         * @returns {object} result 
         */
        delete: {
            acl: {
                before: true
            },
            params: {
                businessRuleId: { type: "string" }
            },			
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                return this.db.delete({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, businessRuleId: ctx.params.businessRuleId });
            }
        },

        /**
         * get events of decision id
         * 
         * @actions
         * @param {string} businessRuleId - stored decision id
         * 
         * @returns {object[]} array of events 
         */
        getEvents: {
            acl: {
                before: true
            },
            params: {
                businessRuleId: { type: "string" }
            },			
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                return this.db.getEvents({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, businessRuleId: ctx.params.businessRuleId });
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

        parse({ expression }) {
            const result = this.interpreter.parse(expression);
            if (result) return { ast: this.interpreter.ast };
            return { result: false, error: this.interpreter.error };
        },

        evaluate({ ast = null, expression = "", context ={} }) {
            if (ast) {
                this.interpreter.ast = ast;
                return this.interpreter.evaluate({ context });
            } else {
                return this.interpreter.evaluate({ expression, context });
            }
        },

        convert({ xml = null }) {
            try {
                const decision = new DMNConverter().convertToObject({ xml });
                return {
                    result: true,
                    ...decision
                };    
            } catch (e) {
                return {
                    result: false,
                    error: e.message
                }
            }
        }
  
    },

    /**
     * Service created lifecycle event handler
     */
    created () {

        if (!this.store) throw new Error("Store provider must be injected first");
        if (!this.groups) throw new Error("Groups provider must be injected first");

        this.db = new DB({ logger: this.broker.logger, groups: this.groups, options: this.settings?.db });

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {

        this.interpreter = new Interpreter();

        // connect to db
        await this.db.connect();
       
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

        // disconnect from db
        await this.db.disconnect();

    }

};