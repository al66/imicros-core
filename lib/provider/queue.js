/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const QueueProvider = {
 
    /**
     * Service created lifecycle event handler
     */
    async created() {
 
        this.queue = {
            add: async (params) => {
                try {
                    return await this.broker.call("v1.queue.add", params);
                } catch (err) {
                    this.logger.error("QueueProvider.add:", err.message);
                    throw err;
                }
            },
            addBatch: async (params) => {
                try {
                    return await this.broker.call("v1.queue.addBatch", params);
                } catch (err) {
                    this.logger.error("QueueProvider.addBatch:", err.message);
                    throw err;
                }
            }
        };

    }
      
} 
  
module.exports = {
    QueueProvider
}