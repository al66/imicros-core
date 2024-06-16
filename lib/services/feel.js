/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Interpreter } = require("imicros-feel-interpreter");
 const { DMNConverter } = require("imicros-feel-interpreter");

module.exports = {
    name: "feel",

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
         * evaluate either an expression, a DMN file (as xml string) or a stored xml with the given context 
         * 
         * @actions
         * @param {string|object} expression - FEEL expression as a string, or { xml } where xml is the content of an DMN file, or { objectName } where objectName points to the stored xml
         * @param {object} context - given context for the expression to be evaluated
         * 
         * @returns {string|boolean|number|object} result 
         */
        evaluate: {
            acl: {
                before: true
            },
            immutable: true,
            params: {
                expression: [
                    { type: "string" },
                    { type: "object", props: { objectName: { type: "string" } } },
                    { type: "object", props: { xml: { type: "string" } } }
                ],
                context: { type: "object" }
            },			
            async handler(ctx) {
                let expression = ctx.params.expression;
                const key = expression?.xml ? `${ ctx.meta.ownerId }-${ this.hashCode(expression.xml) }` : (expression?.objectName ? `${ ctx.meta.ownerId }-${ expression.objectName }` : `${ ctx.meta.ownerId }-${ this.hashCode(expression) }`);
                let ast = this.getFromCache({ key });
                if (!ast) {
                    // get expression
                    if (expression?.objectName) {
                        const xml = await this.store.getObject({ctx: ctx, objectName: expression.objectName });
                        //const xml = await ctx.call(`${ this.services.store }.get`,{ objectName: expression.objectName });
                        expression = this.convert({ xml }).expression;
                    }
                    if (expression?.xml) expression = this.convert({ xml: expression.xml }).expression;
                    // parse
                    const result = this.parse({ expression });
                    ast = result.ast;
                    // add to cache
                    this.addToCache({ key, value: result.ast });
                }

                return this.evaluate({ ast, context: ctx.params.context });
            }
        },

        // convert { xml|objectName } => { result(true|false), error?, expression }
        convert: {
            acl: {
                before: true
            },
            immutable: true,
            params: {
                xml: { type: "string", optional: true },
                objectName: { type: "string", optional: true }
            },			
            async handler(ctx) {
                let xml = ctx.params.xml;
                if (typeof ctx.params.xml === "object") xml = await this.store.getObject({ctx: ctx, objectName: ctx.params.xml?.objectName });
                if (ctx.params.objectName) xml = await this.store.getObject({ctx: ctx, objectName: ctx.params.objectName })
                return this.convert({ xml });
            }
        },

        // check { expression } => { result(true|false), error? }
        check: {
            acl: {
                before: true
            },
            immutable: true,
            params: {
                expression: [
                    { type: "string" },
                    { type: "object", props: { objectName: { type: "string" } } },
                    { type: "object", props: { xml: { type: "string" } } }
                ]
            },			
            async handler(ctx) {
                let expression = ctx.params.expression;
                // get expression
                if (expression?.objectName) {
                    const xml = await this.store.getObject({ctx: ctx, objectName: expression.objectName });
                    expression = this.convert({ xml }).expression;
                }
                if (expression?.xml) expression = this.convert({ xml: expression.xml }).expression;
                // parse
                try {
                    const result = this.parse({ expression });
                    if (result && result.ast) return { result:true, ast: result.ast };
                    return result;
                } catch (e) {
                    return { result: false, error: e.message };
                }
            }
        },


        clearFromCache: {
            acl: {
                before: true
            },
            params: {
                objectName: { type: "string" }
            },
            async handler(ctx) {
                const key = `${ ctx.meta.ownerId }-${ ctx.params.objectName }`;
                return this.removeFromCache({ key });
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
                return {
                    result: true,
                    expression: new DMNConverter().convert({ xml })
                };    
            } catch (e) {
                return {
                    result: false,
                    error: e.message
                }
            }
        },

        // unsecure hash - just used for cache
        hashCode(str) {
            var hash = 0;
            for (var i = 0; i < str.length; i++) {
                var char = str.charCodeAt(i);
                hash = ((hash<<5)-hash)+char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash;
        },

        getFromCache({ key }) {
            if (!this.memCache) this.memCache = [];
            const found = this.memCache.find(element => element.key === key);
            return found ? found.value : null;
        },

        addToCache({ key, value }) {
            if (!this.memCache) this.memCache = [];
            this.memCache.push({ key, value});
            // maximum items in cache
            if (this.memCache.length > this.cache.maxItems) this.memCache.shift();
        },

        removeFromCache({ key }) {
            if (this.memCache) this.memCache = this.memCache.filter(element => element.key !== key);
            return { done: true };
        }

    },

    /**
     * Service created lifecycle event handler
     */
    created () {

        if (!this.store) throw new Error("Store provider must be injected first");

        // cache
        this.cache = {
            maxItems: this.settings?.cache?.maxItems ?? 100
        }

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {

        this.interpreter = new Interpreter();
         
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

    }

};