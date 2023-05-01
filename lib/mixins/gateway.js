/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

const { Errors, IncomingRequest } = require("moleculer-web");
const { Constants } = require("../util/constants");
const jwt 	= require("jsonwebtoken");

module.exports = {
    name: "gateway",
    /**
     * Service settings
     */
    settings: {
        /*
        services: {
            users: "users",
            agents: "agents",
            groups: "groups"
        }
        */
    },

    methods: {

        /**
         * Authorize the request
         *
         * @param {Context} ctx
         * @param {Object} route
         * @param {IncomingRequest} req
         * @returns {Promise}
         */
        async authorize(ctx, route, req) {
            const authToken = this.getAuthToken(req);
            if (!authToken) throw new Errors.UnAuthorizedError(Errors.ERR_NO_TOKEN);
            // initialize meta data for auth
            delete ctx.meta.userToken;
            delete ctx.meta.agentToken;
            delete ctx.meta.accessToken;
            // set authToken in meta
            ctx.meta.authToken = authToken;
            try {
                const decoded = jwt.decode(authToken) || { };
                if (decoded.userId) {
                    // Verify JWT auth token by users service
                    const userToken = await ctx.call(`${this.services.users}.verifyAuthToken`, {});
                    if (userToken) {
                        // set userToken in meta
                        ctx.meta.userToken = userToken;
                        // set accessToken in meta
                        if (decoded.type === Constants.TOKEN_TYPE_GROUP_ACCESS) ctx.meta.accessToken = authToken;
                    }
                } else if (decoded.agentId) {
                    // Verify JWT auth token by agents service
                    const agentToken = await ctx.call(`${this.services.agents}.verifyAuthToken`, {});
                    if (agentToken) {
                        // set agentToken in meta
                        ctx.meta.agentToken = agentToken;
                        // set accessToken in meta
                        if (decoded.type === Constants.TOKEN_TYPE_GROUP_ACCESS) ctx.meta.accessToken = authToken;
                    }
                }
                if (decoded.type === Constants.TOKEN_TYPE_GROUP_ACCESS) {
                    // Verify JWT access token by groups service
                    const accessToken = await ctx.call(`${this.services.groups}.verifyAccessToken`, {});
                    if (accessToken) {
                        // set accessToken in meta
                        ctx.meta.accessToken = accessToken;
                    }
                }
                if (ctx.meta.userToken || ctx.meta.agentToken) return true;
                throw new Errors.UnAuthorizedError(Errors.ERR_INVALID_TOKEN);
            } catch (err) {
                this.logger.debug("unvalid token", err);
                throw new Errors.UnAuthorizedError(Errors.ERR_INVALID_TOKEN);
            }   
        },

        /**
         * Get auth token from request
         * 
         * @param {IncomingRequest} req
         * 
         * @returns {String} authToken
         **/
        getAuthToken(req) {
            let authToken;
            if (req.headers.authorization) {
                let type = req.headers.authorization.split(" ")[0];
                if (type === "Token" || type === "Bearer")
                    authToken = req.headers.authorization.split(" ")[1];
            }
            return authToken;
        }

    },

    created() {
        this.services = {};
        this.services.users = this.settings?.services?.users || "users";
        this.services.agents = this.settings?.services?.agents || "agents";
        this.services.groups = this.settings?.services?.groups || "groups";
    }
}