/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraFlow");
const { Parser } = require("../classes/flow/parser");
const { Process } = require("../classes/flow/process");
const { v4: uuid } = require("uuid");
const { Constants } = require("../classes/util/constants");

module.exports = {
    name: "flow",

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
    dependencies: [],	
 
    /**
     * Actions
     */
    actions: {

        /**
         * Grant access to own group for this service 
         * 
         * @param w/o params
         * 
         * @returns {Object} result -   true|false
         */
        grantAccess: {
            visibility: "public",
            async handler(ctx) {
                return await this.groups.grantServiceAccess({ ctx, serviceId: this.serviceId });
            }
        },

        /**
         * Deploy process
         * 
         * @param {String}   objectName    - path to stored bpmn file
         * 
         * @returns {Object} result 
         * @property {Uuid}  result.processId
         * @property {Uuid}  result.versionId
         * 
         */
        deployProcess: {
            params: {
                objectName: { type: "string" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const ownerId = ctx.meta.ownerId;
                const objectName = ctx.params.objectName;
                const xmlData = await this.store.getObject({ ctx: ctx, objectName });
                const parsedData = this.parser.parse({ xmlData, objectName, ownerId });
                const processId = await this.db.preserveUniqueKey({ key: ownerId + parsedData.process.id, uid: uuid() });
                // replace process id by unique id
                parsedData.process.id = processId;
                let params = {
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken, 
                    processId, 
                    versionId: parsedData.version.id, 
                    xmlData: xmlData.toString(), 
                    parsedData, 
                    attributes: {
                        localId: parsedData.process.localId,
                        objectName: parsedData.process.objectName,
                        version: parsedData.version.name,
                        created: parsedData.version.created
                    }
                };
                return await this.db.saveProcess(params);
            }
        },

        /** 
         * Activate version 
         * 
         * @param {Uuid} processId
         * @param {Uuid} versionId
         * 
         * @returns {Boolean} result
         * 
         * */
        activateVersion: {
            params: {
                processId: { type: "uuid" },
                versionId: { type: "uuid" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const process = await this.db.getProcess({ 
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken, 
                    processId: ctx.params.processId,
                    versionId: ctx.params.versionId
                });
                if (!process || !process.parsedData) throw new Error("Process not found");
                const { subscriptions, timers } = this.process.getInitialEvents({ processData: process.parsedData });
                return await this.db.activateVersion({ 
                    owner: ctx.meta.ownerId,
                    accessToken: ctx.meta.accessToken, 
                    processId: ctx.params.processId, 
                    versionId: ctx.params.versionId, 
                    subscriptions, 
                    timers
                });
            }
        },

        /** 
         * Deactivate version 
         * 
         * @param {Uuid} processId
         * 
         * @returns {Boolean} result
         * 
         * */
        deactivateVersion: {
            params: {
                processId: { type: "uuid" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                return await this.db.deactivateVersion({ 
                    owner: ctx.meta.ownerId,
                    processId: ctx.params.processId
                });
            }
        },

        /**
         * Get process list
         * 
         * @param {Uuid}    [processId]    - process id
         * @param {Boolean} [versions]     - include versions
         * @param {Boolean} [instances]    - include instances
         * 
         * @returns {Object[]}      processes - list of processes
         * @property {Uuid}         processes[].processId
         * @property {String}       processes[].name
         * @property {Uuid}         processes[].versionId
         * @property {Timestamp}    processes[].activatedAt
         * @property {Uuid[]}       processes[].versions
         * @property {Uuid[]}       processes[].instances
         */
        getProcessList: {
            params: {
                processId: { type: "uuid", optional: true },
                versions: { type: "boolean", optional: true, default: false },
                instances: { type: "boolean", optional: true, default: false }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const params = {
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken,
                    processId: ctx.params.processId || null,
                    versions: ctx.params.versions, 
                    instances: ctx.params.instances
                }
                const result = await this.db.getVersionList(params);       
                return result;
            }
        },

        /**
         * Get process
         * 
         * @param {Uuid}    processId
         * @param {Uuid}    versionId
         * @param {Boolean} [xml] - include xml data
         * 
         * @returns {Object} process
         * @property {Uuid}         process.processId
         * @property {Uuid}         process.versionId
         * @property {Timestamp}    process.created
         * @property {Object}       process.parsedData
         * @property {String}       process.xmlData
         * 
         * */
        getProcess: {
            params: {
                processId: { type: "uuid" },
                versionId: { type: "uuid" },
                xml: { type: "boolean", optional: true, default: false }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const params = {
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken,
                    processId: ctx.params.processId,
                    versionId: ctx.params.versionId,
                    xml: ctx.params.xml,
                }
                const result = await this.db.getProcess(params);       
                return result;
            }
        },

        /**
         * raise event
         * 
         * @param {String}  name            - name of event
         * @param {Stringt} eventId         - unique id of event
         * @param {String}  [correlationId] - correlation id for intermediate catching events (optional)
         * @param {Object}  payload 
         * 
         * @returns {Object} result     -  { eventId || err }
         */
        raiseEvent: {
            params: {
                name: { type: "string" },
                eventId: { type: "string" },
                correlationId: { type: "string", optional: true },
                payload: { type: "object" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const { objectId } = await this.db.saveObject({
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken,
                    objectId: uuid(),
                    data: ctx.params
                });
                await this.queue.add({
                    topic: Constants.QUEUE_TOPIC_EVENTS, 
                    key: ctx.meta.ownerId, 
                    event: Constants.QUEUE_EVENT_RAISED,
                    data: { 
                        ownerId: ctx.meta.ownerId, 
                        objectId 
                    }
                });
                return { 
                    eventId: ctx.params.eventId,
                    objectId
                };
            }
        },

        /**
         * assign event - queue handler for event assignment
         * 
         * @param {Uuid} groupId }
         * @param {Uuid} objectId }
         * 
         * @returns {Object} result -  { done || err }
         */
        assignEvent: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                objectId: { type: "uuid" }
            },
            async handler(ctx) {
                // TODO retryable errors vs. non-retryable errors
                const result = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!result || !result.accessToken) throw new Error("No access granted");
                const event = await this.db.getObject({ owner: ctx.params.ownerId, accessToken: result.accessToken, objectId: ctx.params.objectId });
                console.log("assignEvent", event);
                const subscriptions = await this.db.getSubscriptions({ 
                    owner: ctx.params.ownerId, 
                    accessToken: result.accessToken,
                    type: Constants.SUBSCRIPTION_TYPE_EVENT,
                    hash: this.process.getHash(event.eventId)
                });
                console.log("subscriptions", subscriptions);
                const topicMessages = [];
                for (let subscription of subscriptions) {
                    // TODO evaluate condition 
                    if (subscription.subscription.correlationId && subscription.subscription.correlationId !== event.correlationId) continue;
                    // existing isntance
                    if (subscription.subscription.instanceId) {
                        topicMessages.push({
                            topic: Constants.QUEUE_TOPIC_INSTANCE,
                            messages: [{
                                key: ctx.params.ownerId, 
                                event: Constants.QUEUE_EVENT_RAISED,
                                data: { 
                                    ownerId: ctx.params.ownerId, 
                                    processId: subscription.subscription.processId,
                                    versionId: subscription.subscription.versionId,
                                    instanceId: subscription.subscription.instanceId,
                                    objectId: ctx.params.objectId
                                }
                            }]
                        });
                    // new instance
                    } else {
                        topicMessages.push({
                            topic: Constants.QUEUE_TOPIC_EVENTS, 
                            messages: [{
                                key: ctx.params.ownerId, 
                                event: Constants.QUEUE_INSTANCE_REQUESTED,
                                data: { 
                                    ownerId: ctx.params.ownerId, 
                                    processId: subscription.subscription.processId,
                                    versionId: subscription.subscription.versionId,
                                    objectId: ctx.params.objectId,
                                    next: Constants.QUEUE_EVENT_RAISED
                                }
                            }]
                        });
                    }
                }
                if (topicMessages.length > 0) {
                    await this.queue.addBatch({ topicMessages });
                }
                return true;
            }
        },

        newInstance: {
            visibility: "public",
            async handler(ctx) {
                // TODO        
            }
        },

        processEvent: {
            visibility: "public",
            async handler(ctx) {
                // TODO        
            }
        },

        processJob: {
            visibility: "public",
            async handler(ctx) {
                // TODO        
            }
        },

        commitJob: {
            async handler(ctx) {
                // TODO        
            }
        },

        addTimerEvent: {
            visibility: "public",
            protected: true,
            params: {
                ownerId: { type: "uuid" },  
                processId: { type: "uuid" },
                versionId: { type: "uuid" },
                instanceId: { type: "uuid", optional: true },
                type: { type: "string" },  
                value: { type: "string" }  
            },
            async handler(ctx) {
                // TODO
                /*
                const { accessToken } = await this.groups.requestAccessForService({ groupId: owner[0], serviceId: this.serviceId });
                const timerEncrypted = await this.groups.encrypt({ accessToken, data: { 
                    type: type, 
                    value: value
                 }});
                const subscriptionEncrypted = await this.groups.encrypt({ accessToken, data: { 
                    processId: processId, 
                    versionId: versionId, 
                    instanceId: instanceId
                }});
                let params = {
                    day: timerDay,
                    time: timerTime,
                    partition: 0,
                    id: uuid(),
                    owner: owner[0], 
                    timer: timerEncrypted,
                    start: true,
                    subscription: subscriptionEncrypted
                };
                const res = await this.db.addTimer(params);
                return res;
                */
            }
        },

        emitTimerEvents: {
            visibility: "public",
            protected: true,
            params: {
                event: { type: "string", optional: true },  
                time: { type: "number" }                    // time in ms
            },
            async handler(ctx) {
                let count = 0;
                return count;
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
    created () {

        if (!this.store) throw new Error("Store provider must be injected first");
        if (!this.groups) throw new Error("Groups provider must be injected first");
        if (!this.queue) throw new Error("Queue provider must be injected first");

        this.parser = new Parser({ logger: this.broker.logger });

        this.process = new Process({ logger: this.broker.logger });

        this.serviceId = process.env.SERVICE_ID_FLOW;

        this.db = new DB({
            logger: this.broker.logger,
            groups: this.groups,
            options: this.settings?.db || {}
        });

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
        await this.db.connect();
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        await this.db.disconnect();
    }

};

