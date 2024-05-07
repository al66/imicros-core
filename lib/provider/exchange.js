/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const ExchangeProvider = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.exchange = {
            getMessage: async (params) => {
                const { ctx, accessToken } = params;
                if (!ctx) {
                    const opts = { meta: { acl: { accessToken } } };
                    return await this.broker.call("v1.exchange.getMessage", params);
                } else {
                    return await ctx.call("v1.exchange.getMessage", params);
                }
            }
        };
    }
      
} 
  
module.exports = {
    ExchangeProvider
}