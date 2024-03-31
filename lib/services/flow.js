/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

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

        deployProcess: {
            async handler(ctx) {
                // TODO        
            }
        },

        activateVersion: {
            async handler(ctx) {
                // TODO        
            }
        },

        deactivateVersion: {
            async handler(ctx) {
                // TODO        
            }
        },

        /**
         * Get process list
         * 
         * @param {Uuid} ownerId    - owner id
         * 
         * @returns {Object} result -   list of processes in format { processId, name, versionId, versionName, created(timestamp) }
         */
        getProcessList: {
            async handler(ctx) {
                // TODO        
            }
        },

        /**
         * Get versions list
         * 
         * @param {Uuid} ownerId    - owner id
         * @param {Uuid} processId  - process id
         * 
         * @returns {Object} result -   list of versions in format { processId, versionId, name, created(timestamp) }
         */
        getVersionsList: {
            async handler(ctx) {
                // TODO        
            }
        },

        /**
         * raise event
         * 
         * @param {String}  name            - name of event
         * @param {Stringt} eventId         - unique id of event
         * @param {String}  correlationId   - correlation id for intermediate catching events (optional)
         * @param {Object}  payload 
         * 
         * @returns {Object} result     -  { eventId || err }
         */
        raiseEvent: {
            async handler(ctx) {
                // TODO        
                // store event { name, payload, correlationId } encrypted in cassandra under groupId, eventId
                // queue add { topic: Constants.TOPIC_EVENT_RAISED, key: groupId, data: { groupId, eventId } }
                // return { eventId }
            }
        },

        /**
         * assign event
         * 
         * @param {Object}   data   - { groupId, eventId }
         * 
         * @returns {Object} result -  { done || err }
         */
        assignEvent: {
            visibility: "public",
            async handler(ctx) {
                // TODO        
                // request access for service
                // read event from cassandra
                // get subscriptions
                // for each subscription
                //   check correlationId, if subscription.correlationId is given
                //   if new instance
                //     queue add { topic: Constants.TOPIC_NEW_INSTANCE, key: groupId, data: { groupId, processId, versionId, eventId } 
                //   else
                //     queue add { topic: Constants.TOPIC_EVENT_ASSIGNED, key: groupId, data: { groupId, processId, versionId, instanceId, eventId } 
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

        this.serviceId = process.env.SERVICE_ID_FLOW;

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
         
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {

    }

};

