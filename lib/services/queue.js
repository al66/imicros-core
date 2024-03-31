/**
 * @license MIT, imicros.de (c) 2019 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const { v4: uuid } = require("uuid");

module.exports = {
    name: "queue",
    
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
        allowAutoTopicCreation: false
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
    actions: {

        /**
         * add message to queue
         * 
         * @actions
         * @param {String} topic
         * @param {Object} data
         * 
         * @returns {String} result 
         */
        add: {
            visibility: "public",
            params: {
                topic: { type: "string" },
                key: { type: "string" },
                event: { type: "string" },
                data: { type: "object" }
            },
            async handler(ctx) {
                    
                // Publish
                try {
                    await this.producer.send({
                        topic: ctx.params.topic,
                        messages: [
                            { key: ctx.params.key, value: JSON.stringify({ event: ctx.params.event ,data: ctx.params.data})}
                        ]
                    });
                    this.logger.debug("Message published", { topic: ctx.params.topic });
                    return true;
                } catch (err) {
                    this.logger.error(`Failed to publish message to topic ${ctx.params.topic}`, { error: err });
                    throw err;
                }
                
            }
        },

        /**
         * add a batch of messages to queue
         * 
         * @actions
         * @param {Object} batch - array of { topic, messages: array of { key, value } }
         * 
         * @returns {String} result 
         */
        addBatch: {
            visibility: "public",
            params: {
                topicMessages: { type: "array", items: "object", props: {
                    topic: { type: "string" },
                    messages: { type: "array", items: "object", props: {
                        key: { type: "string" },
                        event: { type: "string" },
                        data: { type: "object" }
                    }}
                }}
            },
            async handler(ctx) {
                let topicMessages = ctx.params.topicMessages;
                // Publish
                try {
                    topicMessages = ctx.params.topicMessages.map(single => {
                        const mapped = {
                            topic: single.topic,
                            messages: single.messages.map(message => {
                                return { key: message.key, value: JSON.stringify({ event: message.event, data: message.data}) };
                            })
                        }
                        return mapped;
                    });
                    await this.producer.sendBatch({ topicMessages });
                    this.logger.debug("Batch of messages published", { count: ctx.params.topicMessages.length });
                    return true;
                } catch (err) {
                    this.logger.error("Failed to publish batch of messages", { topicMessages, error: err });
                    throw err;
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

        if (!this.serializer) throw new Error("Serializer provider must be injected first");

        this.clientId = this.name + uuid(); 
        this.brokers = this.settings?.brokers || ["localhost:9092"];
        
        // serviceLogger = kafkaLogLevel => ({ namespace, level, label, log }) ...
        this.serviceLogger = () => ({ level, log }) => {
            switch(level) {
				/* istanbul ignore next */
                case logLevel.ERROR:
                    return this.logger.error("namespace:" + log.message, log);
				/* istanbul ignore next */
                case logLevel.WARN:
                    return this.logger.warn("namespace:" + log.message, log);
				/* istanbul ignore next */
                case logLevel.INFO:
                    return this.logger.info("namespace:" + log.message, log);
				/* istanbul ignore next */
                case logLevel.DEBUG:
                    return this.logger.debug("namespace:" + log.message, log);
				/* istanbul ignore next */
                case logLevel.NOTHING:
                    return this.logger.debug("namespace:" + log.message, log);
            }
        };
        
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
            logLevel: 5, //logLevel.DEBUG,
            logCreator: this.serviceLogger,
            ssl: this.settings?.ssl || null,     // refer to kafkajs documentation
            sasl: this.settings?.sasl || null,   // refer to kafkajs documentation
            connectionTimeout: this.settings?.connectionTimeout ||  this.defaults.connectionTimeout,
            retry: this.settings?.retry || this.defaults.retry
        });

    },
        
    /**
     * Service started lifecycle event handler
     */
    async started() {

        this.producer = await this.kafka.producer({
            allowAutoTopicCreation: this.settings?.allowAutoTopicCreation || false
        });
        await this.producer.connect();
        this.logger.info("Producer connected to kafka brokers " + this.brokers.join(","));

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

        await this.producer.disconnect();
        this.logger.info("Producer disconnected");

    }
    
};