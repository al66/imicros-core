/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Kafka, logLevel } = require("kafkajs");
const { v4: uuid } = require("uuid");

module.exports = {
    name: "clock",
    
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
        topic: "clock",
        groupId: "clock",
        fromBeginning: false,
        allowAutoTopicCreation: false,
        precision: 1000
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
         * processMessage
         *     - emit new clock event
         * 
         * @param {Object} message 
         * @param {Object} subscription 
         * 
         * @returns {Boolean} result
         */
        async processMessage(message) {
            let offset = message.offset.toString();
            try {
                let data, event;
                try {
                    data = JSON.parse(message.value.toString());
                } catch(err) {
                    this.logger.warn(`Message with unvalid content received`, {
                        topic,
                        offset,
                        value: message.value.toString()
                    });
                }
                this.logger.debug(`Message received`, {
                    topic: this.topic,
                    offset,
                    data
                });
                // set last tick to precision
                let time = data.time ? Math.floor(data.time / this.precision) * this.precision : null;
                // restart clock if more than 7 days difference to current time
                if (time && (time + 604800000) < Date.now()) {
                    this.logger.info("Clock restarted", { time, restart: Date.now() });
                    time = Math.floor(Date.now() / this.precision) * this.precision;
                    event = JSON.stringify({ event: "restart", time, old: data.time });
                // wait for next clock event
                } else if (time && (time + this.precision) > Date.now()) {
                    this.logger.debug("Idle");
                    await new Promise(resolve => setTimeout(resolve, (time  + this.precision) - Date.now()));
                    event = JSON.stringify({ event: "tick", time: time + this.precision  });
                    this.lastTick = time;
                // already missed clock event
                } else if (time && time > this.lastTick) {
                    event = JSON.stringify({ event: "tick", time: time + this.precision  });
                    this.lastTick = time;
                } else {
                    this.logger.warn(`Message with unvalid time received`, {
                        topic: this.topic,
                        offset,
                        data,
                        time,
                        lastTick: this.lastTick,
                    });
                    // ignore event
                }
                this.init = false;
                if (event) await this.producer.send({ 
                    topic: this.topic,
                    messages: [{ value: event }]
                });
            } catch(err) {
                this.logger.warn("Message not processed", { topic: this.topic, offset, err});
                return Promise.reject(err);
            }            
        },

        async initClock() {
            // wait 10 seconds for messages
            const self = this;
            await new Promise(resolve => {
                self.waitInit = setTimeout(resolve, this.initWait || 10000);
                return self.waitInit;
            });
            // if no messages have been received yet, send init message
            if (this.init) {
                this.admin = this.kafka.admin();
                await this.admin.connect();
                const offsets = await this.admin.fetchOffsets({ groupId: this.groupId, topics: [this.topic] });
                this.logger.info("Init clock check", { topic: this.topic, offsets });
                let init = false;
                if (offsets && Array.isArray(offsets) && offsets[0]) {
                    if (!offsets[0].partitions.find(partition => partition.offset > 0)) {
                        init = true;
                    }
                } else {
                    init = true;
                }
                if (init === true) {
                    this.logger.info("Init clock", { topic: this.topic, time: Date.now() });
                    await this.producer.send({ 
                        topic: this.topic,
                        messages: [{ value: JSON.stringify({ event: "init", time: Date.now() })}]
                    });
                }
                this.init = false;
                await this.admin.disconnect();
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
        
        this.clientId = this.name + uuid(); 
        this.brokers = this.settings.brokers || ["localhost:9092"];

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

        this.topic = this.settings?.topic || "clock";
        this.groupId = this.settings?.groupId || "clock";
        this.consumer = this.kafka.consumer({ 
            groupId: this.groupId,
            allowAutoTopicCreation: this.settings?.allowAutoTopicCreation || false
        });
        this.producer = this.kafka.producer({
            allowAutoTopicCreation: this.settings?.allowAutoTopicCreation || false
        });
       

        this.precision = this.settings?.precision || 100;
        this.lastTick = 0;
        this.initWait = this.settings?.initWait || 10000;

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
        
        this.init = true;

        await this.producer.connect();
        // Start consumer
        await this.consumer.subscribe({ topic: this.topic, fromBeginning: this.settings?.fromBeginning || true });
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                await this.processMessage(message);
            }
        });
        // init clock, if no messages available
        this.initClock();

    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

        this.stopped = true;
        if (this.waitInit) clearTimeout(this.waitInit);
        if (this.producer) {
            await this.producer.disconnect();
            this.logger.info("Producer disconnected");
        }
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