/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

module.exports = ({service}) => { 
    
    /**
     * Expose middleware
     */    
    return {
    
        // wrap local action - call acl 
        localAction(next, action) {
            return async function(ctx) {

                // acl check before call based on action and parameters or after call based on the result
                ctx.broker.logger.debug("call wrapped action", { action: action.name, acl: action.acl });
                if (action.acl?.before ) {
                    await ctx.call(service+".isAuthorized",{ action, ctx, abort: true });
                }
                
                if (action.acl?.after) {
                    const res = await next(ctx);
                    await ctx.call(service+".isAuthorized",{ action, ctx, result: res, abort: true });
                    return res;
                } else {
                    return next(ctx);
                }
            };
        },

        // After broker started
        async started(broker) {

            // wait for acl service
            await broker.waitForServices([service]);

        }
    };
};