/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { map } = require("../classes/map/map");
 
/** Actions */
// action map { name, template, data } => result
 
module.exports = {
    name: "map",
     
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
         * @param {Object} template
         * @param {Object} data
         * 
         * @returns {Object} result 
         */
        map: {
            acl: {
                before: true
            },
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
                        tpl = await this.getString({ctx: ctx, objectName: objectName});
                    } catch (err) {
                        this.logger.debug("Failed to retrieve map template from object store", {err: err});
                        return null;
                    }
                } else {
                    tpl = ctx.params.template;
                }
                 
                // render map
                try {
                    return await map(tpl, ctx.params.data);
                } catch (err) {
                    this.logger.debug("Failed to render map template", {err: err});
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
    created() {},
         
    /**
     * Service started lifecycle event handler
     */
    started() {},
 
    /**
     * Service stopped lifecycle event handler
     */
    stopped() {}
     
};