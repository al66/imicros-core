/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const BusinessRulesProvider = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.businessRules = {
            evaluate: async (params) => {
                const { ctx, ownerId, accessToken } = params;
                if (!ctx) {
                    const opts = { meta: { ownerId, accessToken, acl: { accessToken } } };
                    return await this.broker.call("v1.businessRules.evaluate", params, opts);
                } else {
                    return await ctx.call("v1.businessRules.evaluate", params);
                }
            }
        };
    }
      
} 
  
module.exports = {
    BusinessRulesProvider
}