/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraFlow");
const { Parser } = require("../classes/flow/parser");
const { Process } = require("../classes/flow/process");
const { v4: uuid } = require("uuid");
const { Constants } = require("../classes/util/constants");
const { CreateInstance,
        RaiseEvent,
        CommitJob } = require("../classes/flow/commands/commands");

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
         * @returns {Object} result -   true|false
         */
        grantAccess: {
            // visibility: "public",
            acl: {
                before: true
            },
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
            acl: {
                before: true
            },
            params: {
                objectName: { type: "string" }
            },
            async handler(ctx) {
                //this.logger.debug("Deploy process", { meta: ctx.meta });
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
            acl: {
                before: true
            },
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
            acl: {
                before: true
            },
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
            acl: {
                before: true
            },
            immutable: true,
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
         * Get timer list
         * 
         * @param {Date}   from
         * @param {Date}   to
         * 
         * @returns {Object[]}      timers - list of timers
         */
        getTimerList: {
            acl: {
                before: true
            },
            immutable: true,
            params: {
                from: { type: "date" },
                to: { type: "date" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                return await this.db.getOwnerTimerList({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, from: ctx.params.from, to: ctx.params.to });
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
            acl: {
                before: true
            },
            immutable: true,
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

        getObject: {
            acl: {
                before: true
            },
            immutable: true,
            params: {
                objectId: { type: "uuid" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                return await this.db.getObject({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, objectId: ctx.params.objectId });
            }
        },

        inspect: {
            acl: {
                before: true
            },
            immutable: true,
            params: {
                instanceId: { type: "uuid" }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const owner = ctx.meta.ownerId;
                const accessToken = ctx.meta.accessToken;
                const instanceId = ctx.params.instanceId;
                const process = new Process({ db: this.db, logger: this.logger });
                await process.load({ owner, accessToken, uid: instanceId });
                return await process.inspect();
            }
        },

        /**
         * raise event
         * 
         * @param {String}  name            - name of event
         * @param {String}  eventId         - unique id of event
         * @param {String}  [correlationId] - correlation id for intermediate catching events (optional)
         * @param {Object}  payload 
         * 
         * @returns {Object} result     -  { eventId || err }
         */
        raiseEvent: {
            acl: {
                before: true
            },
            params: {
                name: { type: "string", optional: true },
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
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                const owner = ctx.params.ownerId;
                const event = await this.db.getObject({ owner, accessToken, objectId: ctx.params.objectId });
                const subscriptionValue = event.eventId + (event.correlationId || "");
                const subscriptions = await this.db.getSubscriptions({ 
                    owner, 
                    accessToken,
                    type: Constants.SUBSCRIPTION_TYPE_EVENT,
                    hash: this.process.getHash(subscriptionValue)
                });
                const topicMessages = [];
                const unsubscribe = [];
                for (let subscription of subscriptions) {
                    // existing instance
                    if (subscription.subscription.instanceId) {
                        const active = await this.db.getVersionList({ 
                            owner, 
                            accessToken, 
                            processId: subscription.subscription.processId, 
                            instances: true
                        });
                        if (!active || !(active.length > 0)) {
                            unsubscribe.push(subscription);
                            continue;
                        }
                        // check for instance
                        const instance = active[0].activeInstances.find(item => item.instanceId === subscription.subscription.instanceId);
                        if (!instance) {
                            unsubscribe.push(subscription);
                            continue;
                        };
                        topicMessages.push({
                            topic: Constants.QUEUE_TOPIC_INSTANCE,
                            messages: [{
                                key: owner, 
                                event: Constants.QUEUE_EVENT_RAISED,
                                data: { 
                                    ownerId: owner, 
                                    processId: subscription.subscription.processId,
                                    versionId: subscription.subscription.versionId,
                                    instanceId: subscription.subscription.instanceId,
                                    objectId: ctx.params.objectId
                                }
                            }]
                        });
                    // new instance
                    } else {
                        const active = await this.db.getVersionList({ 
                            owner, 
                            accessToken, 
                            processId: subscription.subscription.processId
                        });
                        if (!active || !(active.length > 0) || !(active[0].versionId === subscription.subscription.versionId)) {
                            unsubscribe.push(subscription);
                            continue;
                        };
                        topicMessages.push({
                            topic: Constants.QUEUE_TOPIC_EVENTS, 
                            messages: [{
                                key: owner, 
                                event: Constants.QUEUE_INSTANCE_REQUESTED,
                                data: { 
                                    ownerId: owner, 
                                    processId: subscription.subscription.processId,
                                    versionId: subscription.subscription.versionId,
                                    instanceId: uuid(),
                                    objectId: ctx.params.objectId,
                                    origin: Constants.QUEUE_EVENT_RAISED
                                }
                            }]
                        });
                    }
                }
                if (unsubscribe.length > 0) {
                    await this.db.unsubscribe({ owner, accessToken, subscriptions: unsubscribe });
                }
                if (topicMessages.length > 0) {
                    await this.queue.addBatch({ topicMessages });
                }
                return true;
            }
        },

        /**
         * assign message event - queue handler for event assignment
         * 
         *  - notification in KAFKA event is encrypted
         *  - notification contains message id, fetch token, message code 
         * 
         * @param {Uuid} groupId }
         * @param {Uuid} objectId }
         * 
         * @returns {Object} result -  { done || err }
         */
        assignMessage: {
            visibility: "public",
            params: {
                groupId: { type: "uuid" },
                notificationId: { type: "uuid" },
                notification: { type: "object" }
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.groupId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                const owner = ctx.params.groupId;
                // decrypt notification
                const notification = await this.groups.decryptValues({ accessToken, data: ctx.params.notification });
                // fetch massage
                const message = await this.exchange.getMessage({ 
                    accessToken,
                    sender: notification.sender,
                    messageId: notification.messageId,
                    fetchToken: notification.fetchToken
                });
                // save message
                await this.db.saveObject({ 
                    owner, 
                    accessToken, 
                    objectId: ctx.params.notificationId, 
                    data: {
                        name: notification.messageCode,
                        eventId: notification.messageCode,
                        correlationId: message.correlationId,
                        payload: {
                            notification,
                            message
                        }
                    }
                });
                // get subscriptions - will not work w/o messageCode
                const subscriptionValue = (notification.messageCode || notification.messageId) + (message.correlationId || "");
                const subscriptions = await this.db.getSubscriptions({ 
                    owner, 
                    accessToken,
                    type: Constants.SUBSCRIPTION_TYPE_MESSAGE,
                    hash: this.process.getHash(subscriptionValue)
                });
                // assign message to subscriptions
                const topicMessages = [];
                const unsubscribe = [];
                for (let subscription of subscriptions) {
                    // existing instance
                    if (subscription.subscription.instanceId) {
                        const active = await this.db.getVersionList({ 
                            owner, 
                            accessToken, 
                            processId: subscription.subscription.processId, 
                            instances: true
                        });
                        if (!active || !(active.length > 0)) {
                            unsubscribe.push(subscription);
                            continue;
                        }
                        // check for instance
                        const instance = active[0].activeInstances.find(item => item.instanceId === subscription.subscription.instanceId);
                        if (!instance) {
                            unsubscribe.push(subscription);
                            continue;
                        };
                        // ok, instance is active
                        topicMessages.push({
                            topic: Constants.QUEUE_TOPIC_INSTANCE,
                            messages: [{
                                key: owner, 
                                event: Constants.QUEUE_EVENT_RAISED,
                                data: { 
                                    ownerId: owner, 
                                    processId: subscription.subscription.processId,
                                    versionId: subscription.subscription.versionId,
                                    instanceId: subscription.subscription.instanceId,
                                    objectId: ctx.params.notificationId
                                }
                            }]
                        });
                    // new instance
                    } else {
                        const active = await this.db.getVersionList({ 
                            owner, 
                            accessToken, 
                            processId: subscription.subscription.processId
                        });
                        if (!active || !(active.length > 0) || !(active[0].versionId === subscription.subscription.versionId)) {
                            unsubscribe.push(subscription);
                            continue;
                        };
                        topicMessages.push({
                            topic: Constants.QUEUE_TOPIC_EVENTS, 
                            messages: [{
                                key: owner, 
                                event: Constants.QUEUE_INSTANCE_REQUESTED,
                                data: { 
                                    ownerId: owner, 
                                    processId: subscription.subscription.processId,
                                    versionId: subscription.subscription.versionId,
                                    instanceId: uuid(),
                                    objectId: ctx.params.notificationId,
                                    origin: Constants.QUEUE_EVENT_RAISED
                                }
                            }]
                        });
                    }
                }
                if (unsubscribe.length > 0) {
                    await this.db.unsubscribe({ owner, accessToken, subscriptions: unsubscribe });
                }
                if (topicMessages.length > 0) {
                    await this.queue.addBatch({ topicMessages });
                }
                return true;
            }
        },

        createInstance: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                processId: { type: "uuid" },
                versionId: { type: "uuid" },
                instanceId: { type: "uuid" },
                objectId: { type: "uuid" },
                origin: { type: "string" }
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                const owner = ctx.params.ownerId;
                // get process data
                const { parsedData } = await this.db.getProcess({
                    owner, 
                    accessToken, 
                    processId: ctx.params.processId,
                    versionId: ctx.params.versionId
                });
                if (!parsedData) throw new Error("Process not found");
                // create instance
                const instanceId = ctx.params.instanceId;
                const process = new Process({ db: this.db, logger: this.logger });
                await process.load({ owner, accessToken, uid: instanceId });
                await process.execute(new CreateInstance({ instanceId, processData: parsedData }));
                await process.persist({ owner, accessToken });
                // TODO add also event instance.created to instance queue
                // forward event to instance queue
                await this.queue.add({
                    topic: Constants.QUEUE_TOPIC_INSTANCE, 
                    key: ctx.params.ownerId + instanceId,  // instance id must be part of key  
                    event: ctx.params.origin,
                    data: { 
                        ownerId: ctx.params.ownerId, 
                        processId: ctx.params.processId,
                        versionId: ctx.params.versionId,
                        instanceId: ctx.params.instanceId,
                        objectId: ctx.params.objectId 
                    }
                });
                return true;
            }
        },

        processEvent: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                processId: { type: "uuid" },
                versionId: { type: "uuid" },
                instanceId: { type: "uuid" },
                objectId: { type: "uuid" }
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                // get instance
                const owner = ctx.params.ownerId;
                const instanceId = ctx.params.instanceId;
                const process = new Process({ db: this.db, logger: this.logger });
                await process.load({ owner, accessToken, uid: ctx.params.instanceId });
                // get payload
                const event = await this.db.getObject({ owner, accessToken, objectId: ctx.params.objectId });
                if (!event || !event.payload || !event.eventId) throw new Error("Event not found");
                // process instance - raise event
                // TODO add correlationId
                await process.execute(new RaiseEvent({ instanceId, eventId: event.eventId, payload: event.payload }));
                // persist instance
                await process.persist({ owner, accessToken });
                const version = process.getVersion();
                await this.queue.add({
                    topic: Constants.QUEUE_TOPIC_INSTANCE, 
                    key: owner + instanceId,  // instance id must be part of key  
                    event: Constants.QUEUE_INSTANCE_PROCESSED,
                    data: { 
                        ownerId: owner, 
                        instanceId,
                        version
                    }
                });
                return true;
            }
        },

        continueInstance: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                instanceId: { type: "uuid" },
                version: { type: "number" }
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                // get instance
                const owner = ctx.params.ownerId;
                const instanceId = ctx.params.instanceId;
                const version = ctx.params.version;
                const process = new Process({ db: this.db, logger: this.logger });
                await process.load({ owner, accessToken, uid: instanceId });
                const processIds = await process.getProcess();
                // emit continueing events
                const topicMessages = [];
                if (await process.isCompleted()) {
                    topicMessages.push({
                        topic: Constants.QUEUE_TOPIC_INSTANCE,
                        messages: [{
                            key: owner + instanceId,  // instance id must be part of key  
                            event: Constants.QUEUE_INSTANCE_COMPLETED,
                            data: { 
                                ownerId: owner, 
                                processId: processIds.processId,
                                versionId: processIds.versionId,
                                instanceId
                            }
                        }]
                    });
                }
                // new subscriptions for events
                const subscriptions = (await process.getSubscriptions({ version })).map(subscription => {
                    return {
                        processId: processIds.processId,
                        versionId: processIds.versionId,
                        ...subscription
                    }
                });
                if (subscriptions && subscriptions.length > 0) await this.db.subscribe({ owner, accessToken, subscriptions });
                // new scheduled timer
                const timers = (await process.getTimer({ version })).map(timer => {
                    return {
                        processId: processIds.processId,
                        versionId: processIds.versionId,
                        ...timer
                    }
                });
                if (timers && timers.length > 0) await this.db.addTimerList({ owner, accessToken, timers });
                // new jobs
                const jobs = await process.getJobs({ version });
                for (let job of jobs) {   
                    // save job data
                    job.resultId = uuid();  // prepare for saving result
                    await this.db.saveObject({ 
                        owner, 
                        accessToken, 
                        objectId: job.jobId, 
                        data: job 
                    });
                    // forward job to queue
                    topicMessages.push({
                        topic: Constants.QUEUE_TOPIC_INSTANCE,
                        messages: [{
                            key: owner + instanceId,  // instance id must be part of key 
                            event: Constants.QUEUE_JOB_CREATED,
                            data: { 
                                ownerId: owner, 
                                instanceId,
                                jobId: job.jobId
                            }
                        }]
                    });
                }
                // new thrown events
                const throwing = await process.getThrowing({ version });
                for (let event of throwing) {   
                    await this.db.saveObject({ 
                        owner, 
                        accessToken, 
                        objectId: event.uid, 
                        data: event
                    });
                    // forward event to queue
                    topicMessages.push({
                        topic: Constants.QUEUE_TOPIC_EVENTS,
                        messages: [{
                            key: owner, 
                            event: Constants.QUEUE_EVENT_RAISED,
                            data: { 
                                ownerId: owner, 
                                objectId: event.uid 
                            }
                        }]
                    });
                }
                if (topicMessages.length > 0) {
                    await this.queue.addBatch({ topicMessages });
                }
                return true;
            }
        },

        processJob: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                instanceId: { type: "uuid" },
                jobId: { type: "uuid" }
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                const owner = ctx.params.ownerId;
                // get job
                const job = await this.db.getObject({ owner, accessToken, objectId: ctx.params.jobId });
                if (!job || !job.data || !job.jobId || !job.resultId) throw new Error("job not found");
                const service = job.taskDefinition?.type;
                const decision = job.calledDecision?.id;
                // call decision service
                if (decision && !decision.toUpperCase().startsWith("O:")) {
                    let commit = {
                        jobId: job.jobId
                    }
                    try {
                        //console.log("Decision call", { businessRuleId: decision, data: job.data, job });
                        commit.result = await this.businessRules.evaluate({
                            ownerId: owner,
                            accessToken,
                            businessRuleId: decision,
                            context: job.data
                        });
                    } catch (err) {
                        // console.log("Decision Error", err);
                        commit.error = err;
                    }
                    const { objectId } = await this.db.saveObject({
                        owner, 
                        accessToken,
                        objectId: job.resultId,
                        data: commit
                    });
                    await this.queue.add({
                        topic: Constants.QUEUE_TOPIC_INSTANCE, 
                        key: owner + job.instanceId, // instance id must be part of key 
                        event: Constants.QUEUE_JOB_COMPLETED,
                        data: { 
                            ownerId: owner, 
                            jobId: ctx.params.jobId,
                            instanceId: job.instanceId,
                            resultId: objectId 
                        }
                    });
                }
                // call internal service
                if (!decision && service && !service.toUpperCase().startsWith("E:")) {
                    let commit = {
                        jobId: job.jobId
                    }
                    try {
                        const opts = { 
                            meta: { acl: { accessToken } },
                            retries: job.taskDefinition?.retries || 0 
                        };
                        commit.result = await this.broker.call(service, job.data, opts);
                        this.logger.debug("Handler called", { service, result: commit.result });
                    } catch (err) {
                        this.logger.debug("Handler Error", err);
                        commit.error = err;
                    }
                    const { objectId } = await this.db.saveObject({
                        owner, 
                        accessToken,
                        objectId: job.resultId,
                        data: commit
                    });
                    await this.queue.add({
                        topic: Constants.QUEUE_TOPIC_INSTANCE, 
                        key: owner + job.instanceId, // instance id must be part of key 
                        event: Constants.QUEUE_JOB_COMPLETED,
                        data: { 
                            ownerId: owner, 
                            jobId: ctx.params.jobId,
                            instanceId: job.instanceId,
                            resultId: objectId 
                        }
                    });
                }
                // queue job for external service
                if (!decision && service && service.toUpperCase().startsWith("E:")) {
                    // TODO
                }
                return true;
            }
        },

        processCommitJob: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                instanceId: { type: "uuid" },
                jobId: { type: "uuid" },
                resultId: { type: "uuid" }
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                // get instance
                const owner = ctx.params.ownerId;
                const instanceId = ctx.params.instanceId;
                const process = new Process({ db: this.db, logger: this.logger });
                await process.load({ owner, accessToken, uid: ctx.params.instanceId });
                // get result
                const { jobId, result } = await this.db.getObject({ owner, accessToken, objectId: ctx.params.resultId });
                if (!jobId) throw new Error("Job result not found");
                // process instance - commit job
                await process.execute(new CommitJob({ jobId, result }));
                // persist instance
                await process.persist({ owner, accessToken });
                const version = process.getVersion();
                await this.queue.add({
                    topic: Constants.QUEUE_TOPIC_INSTANCE, 
                    key: owner + instanceId, // instance id must be part of key 
                    event: Constants.QUEUE_INSTANCE_PROCESSED,
                    data: { 
                        ownerId: owner, 
                        instanceId,
                        version
                    }
                });
                return true;
            }
        },

        commitJob: {
            params: {
                jobId: { type: "uuid" },
                result: { type: "any", optional: true },
                error: { type: "any", optional: true }
            },
            async handler(ctx) {
                if (!ctx.meta.ownerId) throw new Error("No owner id in context");
                if (!ctx.meta.accessToken) throw new Error("No access token in context");
                const job = await this.db.getObject({ owner: ctx.meta.ownerId, accessToken: ctx.meta.accessToken, objectId: ctx.params.jobId });
                if (!job || !job.resultId) throw new Error("Job not found or not available for commit");
                const { objectId } = await this.db.saveObject({
                    owner: ctx.meta.ownerId, 
                    accessToken: ctx.meta.accessToken,
                    objectId: job.resultId,
                    data: ctx.params
                });
                await this.queue.add({
                    topic: Constants.QUEUE_TOPIC_INSTANCE, 
                    key: ctx.meta.ownerId + job.instanceId, // instance id must be part of key 
                    event: Constants.QUEUE_JOB_COMPLETED,
                    data: { 
                        ownerId: ctx.meta.ownerId, 
                        jobId: ctx.params.jobId,
                        instanceId: job.instanceId,
                        resultId: objectId 
                    }
                });
                return { 
                    jobId: ctx.params.jobId,
                    objectId
                };
            }
        },

        processTick: {
            visibility: "public",
            params: {
                event: { type: "string" },
                time: { type: "number" }
            },
            async handler(ctx) {
                // get day and time
                const date = new Date(ctx.params.time);
                const day = date.toISOString().substring(0,10);
                const time = date.toISOString().substring(11,19);
                // emit event for each partition
                const topicMessages = [];
                for (let partition = 0; partition < this.timerPartitions; partition++) {
                    topicMessages.push({
                        topic: Constants.QUEUE_TOPIC_TIMER, 
                        messages: [{
                            key: partition.toString(), 
                            event: ctx.params.event,
                            data: { 
                                day,
                                time,
                                value: ctx.params.time,
                                partition
                            }
                        }]
                    });
                }
                if (topicMessages.length > 0) {
                    await this.queue.addBatch({ topicMessages });
                }
                return true;
            }
        },

        processTimeEvent: {
            visibility: "public",
            params: {
                day: { type: "string" },
                time: { type: "string" },
                value: { type: "number" },
                partition: { type: "number" }
            },
            async handler(ctx) {
                const timers = await this.db.getTimerList({ 
                    day: ctx.params.day,
                    time: ctx.params.time,
                    partition: ctx.params.partition
                });
                const topicMessages = [];
                for (let timer of timers) {
                    topicMessages.push({
                        topic: Constants.QUEUE_TOPIC_TIMER, 
                        messages: [{
                            key: timer.owner, 
                            event: Constants.QUEUE_TIMER_REACHED,
                            data: { 
                                ownerId: timer.owner, 
                                processId: timer.processId,
                                versionId: timer.versionId,
                                instanceId: timer.instanceId,
                                timeReached: {
                                    day: timer.day,
                                    time: timer.time,
                                    value: ctx.params.value
                                },
                                timerId: timer.id,
                                timer: timer.timer
                            }
                        }]
                    });
                }
                if (topicMessages.length > 0) {
                    await this.queue.addBatch({ topicMessages });
                }
                return true;
            }
        },

        assignTimerEvent: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                processId: { type: "uuid" },
                versionId: { type: "uuid" },
                instanceId: { type: "uuid", nullable: true },
                timeReached: { type: "object", props: { day: { type: "string" }, time: { type: "string" }, value: { type: "number" } } },
                timerId: { type: "uuid" },
                timer: { type: "string" }   // encrypted
            },
            async handler(ctx) {
                // verify granted access
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.params.ownerId, serviceId: this.serviceId });
                if (!accessToken) throw new Error("No access granted");
                // decrypt timer and store as object
                const timer = await this.groups.decrypt({ accessToken, encrypted: ctx.params.timer });
                const owner = ctx.params.ownerId;
                const { objectId } = await this.db.saveObject({ 
                    owner, 
                    accessToken, 
                    objectId: ctx.params.timerId, 
                    data: {
                        name: timer.eventId,
                        eventId: timer.eventId,
                        correlationId: timer.correlationId || null,
                        payload: {
                            ...timer.payload,
                            timeReached: ctx.params.timeReached
                        }
                    }
                });
                // existing instance
                if (ctx.params.instanceId) {
                    const active = await this.db.getVersionList({ 
                        owner, 
                        accessToken, 
                        processId: ctx.params.processId, 
                        instances: true
                    });
                    if (active && active.length > 0) {
                        // check for instance
                        const instance = active[0].activeInstances.find(item => item.instanceId === ctx.params.instanceId);
                        if (instance) {
                            await this.queue.add({
                                topic: Constants.QUEUE_TOPIC_INSTANCE,
                                key: owner, 
                                event: Constants.QUEUE_EVENT_RAISED,
                                data: { 
                                    ownerId: owner, 
                                    processId: ctx.params.processId,
                                    versionId: ctx.params.versionId,
                                    instanceId: ctx.params.instanceId,
                                    objectId
                                }
                            });
                        };
                    }
                // new instance
                } else {
                    const active = await this.db.getVersionList({ 
                        owner, 
                        accessToken, 
                        processId: ctx.params.processId
                    });
                    if (active && active.length > 0 && active[0].versionId === ctx.params.versionId) {
                        await this.queue.add({
                            topic: Constants.QUEUE_TOPIC_EVENTS, 
                            key: owner, 
                            event: Constants.QUEUE_INSTANCE_REQUESTED,
                            data: { 
                                ownerId: owner, 
                                processId: ctx.params.processId,
                                versionId: ctx.params.versionId,
                                instanceId: uuid(),
                                objectId: objectId,
                                origin: Constants.QUEUE_EVENT_RAISED
                            }
                        });
                    };
                }
                return true;
            }
        },

        completeInstance: {
            visibility: "public",
            params: {
                ownerId: { type: "uuid" },
                processId: { type: "uuid" },
                instanceId: { type: "uuid" },
                versionId: { type: "uuid" }
            },
            async handler(ctx) {
                // TODO 
                return true;
            }
        }

    },

    /**
     * Events
     */
    events: {

        /* minio events */
        "StoreObjectUpdated" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "StoreObjectRemoved" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "StoreObjectsRemoved" : { group: "events", async handler (ctx) { await this.raise(ctx); } },

        /* admin events */
        "UserConfirmationRequested" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "UserPasswordResetRequested" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "UserDeletionRequested" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "UserDeletionConfirmed" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "GroupCreated" : { group: "events", async handler (ctx) { await this.raise(ctx); } },
        "GroupDeletionConfirmed" : { group: "events", async handler (ctx) { await this.raise(ctx); } }

    },

    /**
     * Methods
     */
    methods: {

        async raise (ctx) {
            if (!ctx.meta.ownerId || !ctx.eventName) return;
            try {
                const { accessToken } = await this.groups.requestAccessForService({ groupId: ctx.meta.ownerId, serviceId: this.serviceId });
                const { objectId } = await this.db.saveObject({
                    owner: ctx.meta.ownerId, 
                    accessToken: accessToken,
                    objectId: uuid(),
                    data: {
                        name: ctx.eventName,
                        eventId: ctx.eventName,
                        payload: ctx.params
                    }
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
            } catch (err) {
                // ignore access errors
            }
        }

    },

    /**
     * Service created lifecycle event handler
     */
    created () {

        if (!this.store) throw new Error("Store provider must be injected first");
        if (!this.groups) throw new Error("Groups provider must be injected first");
        if (!this.queue) throw new Error("Queue provider must be injected first");
        if (!this.businessRules) throw new Error("Business Rules provider must be injected first");

        this.parser = new Parser({ logger: this.broker.logger });

        this.process = new Process({ logger: this.broker.logger });

        this.serviceId = process.env.SERVICE_ID_FLOW;

        this.db = new DB({
            logger: this.broker.logger,
            groups: this.groups,
            options: this.settings?.db || {}
        });

        this.timerPartitions = this.settings?.timerPartitions || 1;

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

