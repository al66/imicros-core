/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const Handlebars = require("handlebars");

/** Actions */
// action render { templateName, data } => result

module.exports = {
    name: "template",
    
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
    //dependencies: [],	

    /**
     * Actions
     */
    actions: {

        /**
         * render template
         * 
         * @actions
         * @param {String} name
         * @param {Object} data
         * 
         * @returns {String} result 
         */
        render: {
            acl: "before",
            params: {
                name: [{ type: "string", default: "", optional: true },{ type: "array", default: "", optional: true }],
                template: { type: "string", optional: true }, 
                data: { type: "object" }
            },
            async handler(ctx) {
                
                let tpl = {};
                if (!ctx.params.template) {
                  // gateway passes name as array if path is used.. 
                    let objectName = Array.isArray(ctx.params.name) ? ctx.params.name.join("/") :ctx.params.name;


                  // get template from object service
                    try {
                        tpl = await this.getObject({ctx: ctx, objectName: objectName});
                    } catch (err) {
                        this.logger.debug("Failed to retrieve template from object store", {err: err});
                        return null;
                    }
                } else {
                    tpl.template = ctx.params.template;
                }
                
                // compile template
                let template;
                try {
                    template = Handlebars.compile(tpl.template);
                } catch (err) {
                    this.logger.debug("Failed to compile template", {err: err});
                    return null;
                }

                // render template
                try {
                    return await template(ctx.params.data);
                } catch (err) {
                    this.logger.debug("Failed to render template", {err: err});
                    return null;
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
        Handlebars.registerHelper({
            eq: (v1, v2) => v1 === v2,
            ne: (v1, v2) => v1 !== v2,
            lt: (v1, v2) => v1 < v2,
            gt: (v1, v2) => v1 > v2,
            lte: (v1, v2) => v1 <= v2,
            gte: (v1, v2) => v1 >= v2,
            and() {
                return Array.prototype.every.call(arguments, Boolean);
            },
            or() {
                return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
            }
        });
    },
        
    /**
     * Service started lifecycle event handler
     */
    started() {},

    /**
     * Service stopped lifecycle event handler
     */
    stopped() {}
    
};