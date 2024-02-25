/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

// TODO add encrypt and decrypt (preparation for flow service)

class GroupsServiceAccess {
    constructor ({ broker, logger, vault, options }) {

        this.broker = broker;

        // Moleculer logger
        this.logger = logger;

        // Vault provider
        this.vault = vault;

        // service name
        this.service = options.service || "v1.groups"

    }
    
    /** 
     * Grant access for service
     * 
     * @command
     * @param {object} ctx          - context of the request
     * @param {String} serviceId    - service id
     * @param {String} hash         - hash for identifying the service
     * 
     * @throws UnvalidRequest
     * @throws RequiresAdminRole
     * 
     * @returns {Boolean} accepted
     */
    async grantServiceAccess({ ctx, serviceId }) {
        const groupId = ctx.meta?.ownerId ?? null;
        if (!groupId) return false;
        const opts = { meta: ctx.meta };
        console.log("grantServiceAccess", groupId, serviceId, this.service);
        const params = {
            groupId,
            serviceId,
            serviceName: this.service,
            hash: await this.vault.hash(serviceId, groupId)
        };
        return await this.broker.call(this.service + ".grantServiceAccess", params, opts);
    }
    
    /**
     * Request group acccess for service
     * 
     * @query
     * @param {String} groupId      - group id
     * @param {String} serviceId    - service id
     * @param {String} hash         - hash for identifying the service
     * 
     * @throws UnvalidRequest
     * @throws ServiceAccessNotAllowed
     * 
     * @returns {Object} accessToken
     */
    async requestAccessForService({ groupId, serviceId }) {
        const opts = {};
        const params = {
            groupId,
            serviceId,
            hash: await this.vault.hash(serviceId, groupId)
        };
        return await this.broker.call(this.service + ".requestAccessForService", params, opts);
    }

    async encrypt({ ctx, accessToken, data }) {
        const params = {
            data
        };
        if (!ctx) {
            const opts = { acl: { accessToken } };
            return await this.broker.call(this.service + ".encrypt", params, opts);
        } else {
            return await ctx.call(this.service + ".encrypt", params);
        }
    }

    async decrypt({ ctx, accessToken, encrypted }) {
        const params = {
            encrypted
        };
        if (!ctx) {
            const opts = { acl: { accessToken } };
            return await this.broker.call(this.service + ".decrypt", params, opts);
        } else {
            return await ctx.call(this.service + ".decrypt", params);
        }
    }

    /**
     * encrypt object attributes (e.g. password) with group key
     *
     * the attributes to be encrypted must be wrapped in { _encrypt: value | object } and will be replaced by the encrypted value wrapped in { _encrypted: encrypted string }
     * either the context or the access token is required
     * 
     * @command
     * @param {object} ctx          - context of the calling request (optional)
     * @param {String} accesstoken  - access token retrieved from requestAccessForService (optional)
     * @param {Object} data
     * 
     * @throws GroupDoesNotExists
     * 
     * @returns {Object} original object with encrypted attributes
     */
    async encryptValues({ ctx, accessToken, data }) {
        const params = {
            data
        };
        // either called with context or with retrieved access token
        if (!ctx) {
            const opts = { acl: { accessToken } };
            return await this.broker.call(this.service + ".encryptValues", params, opts);
        } else {
            return await ctx.call(this.service + ".encryptValues", params);
        }
    }

    /**
     * decrypt object attributes with group key (must be encrypted with encryptValues by the same service before)
     * 
     * the attribute values to be decrypted are wrapped in { _encrypted: encrypted string } and will be replaced by the decrypted value
     * either the context or the access token is required
     * 
     * @command
     * @param {object} ctx          - context of the calling request (optional)
     * @param {String} accesstoken  - access token retrieved from requestAccessForService (optional)
     * @param {String} data
     * 
     * @throws GroupDoesNotExists
     * 
     * @returns {Object} original object with decrypted attribute values
     */
    async decryptValues({ ctx, accessToken, data }) {
        const params = {
            data
        };
        // either called with context or with retrieved access token
        if (!ctx) {
            const opts = { acl: { accessToken } };
            return await this.broker.call(this.service + ".decryptValues", params, opts);
        } else {
            return await ctx.call(this.service + ".decryptValues", params);
        }
    }
    
    async encryptStream({ ctx, accessToken }) {
        const params = {};
        if (!ctx) {
            const opts = { acl: { accessToken } };
            return await this.broker.call(this.service + ".encryptStream", params, opts);
        } else {
            return await ctx.call(this.service + ".encryptStream", params);
        }
    }

    async decryptStream({ ctx, accessToken }) {
        const params = {};
        if (!ctx) {
            const opts = { acl: { accessToken } };
            return await this.broker.call(this.service + ".decryptStream", params, opts);
        } else {
            return await ctx.call(this.service + ".decryptStream", params);
        }
    }

    /**
     * get the owner from the context
     * 
     * @command
     * @param {Object} ctx - context of the calling request
     * 
     * @returns {Uuid} ownerId
     */
    getOwner ({ ctx }) {
        // already verified in middleware
        if (!ctx.meta?.acl?.ownerId) throw new Error("not authorized");
        return ctx.meta.acl.ownerId;
    }

}

module.exports = { 
    GroupsServiceAccess
};
