/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const { v4: uuid } = require("uuid");

module.exports = {
    name: "worker",
    
    /**
     * Service settings
     */
    settings: {
        /*
        brokers: ["localhost:9092"],
        ssl: {
            rejectUnauthorized: false
        },
        sasl: {
            mechanism: "plain",
            username: "user",
            password: "password"
        },
        connectionTimeout: 1000,
        retry: {
            initialRetryTime: 100,
            retries: 8
        },
        topic: "events",
        groupId: "flow",
        fromBeginning: false,
        allowAutoTopicCreation: false.
        handler: "service.action"
        */        
    },

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
    actions: {},

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {
        
        /**
         * Subscribe 
         *     - Starts a consumer for the subscription 
         * 
         * @param {Object} subscription 
         * 
         */
        async subscribe (subscription) {
            try {
                // memorize consumer for cleaning up on service stop
                this.consumer = this.kafka.consumer({ 
                    groupId: subscription.groupId,
                    allowAutoTopicCreation: subscription.allowAutoTopicCreation
                });

                // connect consumer and subscribe to the topic
                await this.consumer.connect();
                await this.consumer.subscribe({ 
                    topic: subscription.topic, 
                    fromBeginning: subscription.fromBeginning 
                });
                // don't know how to set offset ... better to start always with "fromBeginning"...consuming is quite cheap
                //await this.consumer.seek({ topic: subscription.topic, partition: 0, offset: 0 })

                this.logger.info(`Subscription for topic '${subscription.topic}' starting`, { subscription: subscription });
                // start runner
                await this.consumer.run({
                    eachBatchAutoResolve: false,
                    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary,isRunning, isStale }) => {
                        for (let message of batch.messages) {
                            if (!isRunning() || isStale()) break;
                            await this.processMessage(message, subscription);
                            resolveOffset(message.offset);
                            await heartbeat();
                        }
                        if (!isRunning()) await commitOffsetsIfNecessary();
                    }               
                });

                this.logger.info(`Subscription for topic '${subscription.topic}' running`, { subscription: subscription });

            } catch (e) {
				/* istanbul ignore next */
                this.logger.warn(`Subscription for topic ${subscription.topic}) failed`);
				/* istanbul ignore next */
                throw e;
            }
        },

        /**
         * processMessage
         *      - Calls the event handler 
         * 
         * @param {Object} message 
         * @param {Object} subscription 
         * 
         * @returns {Boolean} result
         */
        async processMessage(message, subscription) {
            let offset = message.offset.toString();
            let topic = subscription.topic;
            try {

                let data;
                try {
                    data = JSON.parse(message.value.toString());
                } catch(err) {
                    this.logger.warn(`Message with unvalid content received`, {
                        topic,
                        offset,
                        subscription: subscription,
                        value: message.value.toString()
                    });
                }
                let params = data.data || data, options = { meta: { queue: { subscription }} };
                let handler = subscription.handler.find(handler => handler.event ===  data.event)?.handler || null;
                if (!handler) subscription.handler.find(handler => handler.default)?.handler || null;
 
                this.logger.debug(`Message received`, {
                    topic,
                    offset,
                    subscription: subscription,
                    data,
                    handler
                });

                /* 
                 * call the given handler of subscription
                 */
                if (handler && params ) {

                    await this.broker.call(handler, params, options);
                    this.logger.info(`Handler called`, {
                        topic,
                        offset,
                        handler
                    });
                } else {
                    this.logger.warn(`No handler found for event ${data.event}`, {
                        topic,
                        offset,
                        subscription: subscription,
                        data
                    });
                }

            } catch(err) {
                switch (err.constructor) {
                    default: {
                        this.logger.error("Unreadable message", { topic, offset, err});
                        return Promise.reject(err);
                    }
                }
            }            
        },
		
        /**
         * log 
         *      - map kafkajs log to service logger 
         * 
         * @param {String} namespace 
         * @param {Object} level 
         * @param {String} label 
         * @param {Object} log 
         * 
         */
        log({ namespace, level, log }) {
            if (this.stopped) return;
            switch(level) {
				/* istanbul ignore next */
                case logLevel.ERROR:
                    return this.logger.error("KAFKAJS: " + namespace + log.message, log);
				/* istanbul ignore next */
                case logLevel.WARN:
                    return this.logger.warn("KAFKAJS: " + namespace + log.message, log);
                case logLevel.INFO:
                    return this.logger.info("KAFKAJS: " + namespace + log.message, log);
                case logLevel.DEBUG:
                    return this.logger.debug("KAFKAJS: " + namespace + log.message, log);
				/* istanbul ignore next */
                case logLevel.NOTHING:
                    return this.logger.debug("KAFKAJS: " + namespace + log.message, log);
            }
        }
        
    },

    /**
     * Service created lifecycle event handler
     */
    created() {
        
        if (!this.serializer) throw new Error("Serializer must be injected first");

        this.clientId = this.name + uuid(); 
        this.brokers = this.settings.brokers || [ process.env.KAFKA_BROKER ] || ["localhost:9092"];

        this.defaults = {
            connectionTimeout: 1000,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        };
        // Create the client with the broker list
        this.kafka = new Kafka({
            clientId: this.clientId,
            brokers: this.brokers,
            logLevel: 5,                        //logLevel.DEBUG,
            logCreator: () => this.log,			// serviceLogger = kafkaLogLevel => ({ namespace, level, label, log }) ...
            ssl: this.settings?.ssl || null,     // refer to kafkajs documentation
            sasl: this.settings?.sasl || null,   // refer to kafkajs documentation
            connectionTimeout: this.settings?.connectionTimeout ||  this.defaults.connectionTimeout,
            retry: this.settings?.retry || this.defaults.retry
        });

        this.topic = this.settings?.topic || "events";
        this.subscription = {
            topic: this.settings?.topic || "events",
            allowAutoTopicCreation: this.settings?.allowAutoTopicCreation || false,
            groupId: this.settings?.groupId || uuid(),
            fromBeginning: this.settings?.fromBeginning || false,
            handler: this.settings?.handler
        };
        this.consumer = null;

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
        
        // Start consumer
        await this.subscribe(this.subscription);

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

        this.stopped = true;
        if (this.consumer) {
            try {
                await this.consumer.stop();
                await this.consumer.disconnect();
                this.logger.info("Consumer disconnected");
            } catch (err) {
				/* istanbul ignore next */
                this.logger.error("Failed to disconnect consumer", err);
            }
        }
    
    }

};