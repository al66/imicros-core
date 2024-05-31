/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const BusinessRulesProvider = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.decision = {
            evaluate: async (params) => {
                const { ctx, accessToken } = params;
                if (!ctx) {
                    const opts = { meta: { acl: { accessToken } } };
                    return await this.broker.call("v1.decision.evaluate", params);
                } else {
                    return await ctx.call("v1.decision.evaluate", params);
                }
            }
        };
    }
      
} 
  
module.exports = {
    BusinessRulesProvider
}