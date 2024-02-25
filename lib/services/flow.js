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

        raiseEvent: {
            async handler(ctx) {
                // TODO        
                // request access for service
                // store payload under .flow/events/<timestamp>_<uuid>
                // get subscriptions
                // for each subscription
                //  if subscription.position === Constants.START_EVENT
                //   emit token with ownerId, processId, versionId, instanceId = null, elementId, status: EVENT_ACTIVATED, attributes: { _payload: { id, timestamp } }
                //  if subscription.position === Constants.INTERMEDIATE_EVENT
                //   emit token with ownerId, processId, versionId, instanceId = null, elementId, status: EVENT_ACTIVATED, attributes: { _allRunningInstances, _payload: { id, timestamp }, timestamp }
            }
        },

        processToken: {
            async handler(ctx) {
                // TODO        
                // request access for service
                // verify token
                //
                // if token.attributes._allRunningInstances === true
                //  get running instances for process
                //  emit new token for each running instance
                //  return
                //
                // get instance token
                // 
                // const process = new Process({ logger, processId, versionId, parsedData, instanceId, tokenData = {}, context = {} });
                // await process.processToken({ token });
                // await process.persist();
            }
        },

        getScope: {
            async handler(ctx) {
                // TODO        
                
            }
        },

        taskCompleted: {
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

