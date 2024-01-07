/**
 * @license MIT, imicros.de (c) 2021 Andreas Leinen
 */
"use strict";

const { DB } = require("../db/cassandraExchange");
const { Constants } = require("../util/constants");
const { v4: uuid } = require("uuid");
const { createHash } = require('crypto');
const jwt 	= require("jsonwebtoken");
const axios = require('axios');

// TODO ...delete
const util = require("util");

module.exports = {
    name: "exchange",
    
    /**
     * Service settings
     */
    settings: {
        /*
        cassandra: {
            contactPoints: ["192.168.2.124"],
            datacenter: "datacenter1",
            keyspace: "imicros_messages",
            whitelistTable: "allowed",
            messageTable: "messages"
        },
        services: {
            agents: "agents"
        }
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
         * Grant access to own group for this service 
         * 
         * @param w/o params
         * 
         * @returns {Object} result -   true|false
         */
        grantAccess: {
            async handler(ctx) {
                let owner = ctx.meta?.ownerId ?? null;
                if (!owner) return false;
                let result = await ctx.call(this.services.groups + ".grantServiceAccess", { groupId: owner, service: this.name  }, {});
                return result;
            }
        },

        /**
         * Send a message 
         * 
         * @param {String} receiver -   uuid
         * @param {Object} message  -   message (can have ref links to objects)
         * 
         * @returns {Object} result -   { messageId, success, errors }
         */
        sendMessage: {
            acl: "before",
            params: {
                receiver: { type: "string" },
                messageCode: { type: "string", optional: true, default: 0 },
                message: { type: "object" }
            },
            async handler(ctx) {
                let owner = ctx.meta?.ownerId ?? null;
                if (!owner) return { success: false, errors: [{ code: Constants.ERROR_NOT_AUTHORIZED, message: "not authorized" }]};

                // build hash
                const hash = await this.hash({ sender: owner, recipient: ctx.params.receiver });
                // check whitelist
                let result = await this.connector.checkWhiteList({ hash });
                if (!result) return { success: false, errors: [{ code: Constants.ERROR_NOT_ACCEPTED, message: "receiver not in white list" }]};

                // check for granted access (doesn't make sense to send without granted access)
                result = await ctx.call(this.services.groups + ".requestAccessForService", { groupId: owner, service: this.name  }, {});
                if (!result || !result.accessToken) return { success: false, errors: [{ code: Constants.ERROR_NOT_ACCEPTED, message: "sender not granted access" }]};

                const messageId = uuid();
                const messageCode = ctx.params.messageCode;
                // replace references and build list of appendix
                const saveMessage = await this.setAppendixId({ message:ctx.params.message });

                // put message to outbox of sender as { message, appendix }
                this.putObject({ ctx, objectName: `~exchange/${messageId}.message`, value: saveMessage });

                // create fetch token
                const fetchToken = await this.vault.signToken({ 
                    type: Constants.TOKEN_TYPE_EXCHANGE_FETCH, 
                    nodeID: ctx.broker.nodeID,
                    hash: await this.hash({ messageId, owner })
                 }, { expiresIn: "7d" });    

                if (ctx.params.receiver.indexOf("#") > 0) {
                    // TODO external receiver: call notify of receiver
                    const [groupId, url] = ctx.params.receiver.split("#");
                    // TODO: sante url
                    const remoteUrl = "https://" + url + "/notify";
                    try {
                        /*
                        const result = await this.axios({
                            method: "post",
                            url: remoteUrl,
                            data: { sender: this.buildFullAddress(owner), receiver: ctx.params.receiver, fetchToken, messageId, messageCode }
                        });
                        */
                        const result = await this.axios.post(remoteUrl,{
                            sender: this.buildFullAddress(owner), receiver: ctx.params.receiver, fetchToken, messageId, messageCode
                        });
                        console.log("Notify Result",{ result });
                    } catch(e) {
                        console.log(e);
                        // TODO: errror code
                        return { success: false, errors: [{ code: Constants.ERROR_NOTIFY, message: "failed to notify receiver" }]};
                    }
                } else {
                    // internal receiver: emit Event
                    const result = await this.emitNotifyEvent({ ctx, fetchToken, messageId, senderId: owner, receiverId: ctx.params.receiver, messageCode });
                    // TODO: errror code
                    if (!result) return { success: false, errors: [{ code: Constants.ERROR_NOTIFY, message: "failed to notify receiver" }]};
                }
                return { success: true, messageId };
            }
        },
                
        /**
         * Send a message 
         * 
         * @param {String} receiver -   uuid
         * @param {Object} message  -   message (can have ref links to objects)
         * 
         * @returns {Object} result -   { messageId, success, errors }
         */
        // TODO replace by sendMessage
        send: {
            acl: "before",
            params: {
                receiver: { type: "uuid" },
                message: { type: "object" }
            },
            async handler(ctx) {
                let owner = ctx.meta?.ownerId ?? null;
                if (!owner) return { success: false, errors: [{ code: Constants.ERROR_NOT_AUTHORIZED, message: "not authorized" }]};

                // create message entry in owners outbox and retrieve messageId
                let { messageId } = await this.connector.addMessage({ owner, box: Constants.OUTBOX, partner: ctx.params.receiver, status: Constants.STATUS_SEND });
                if (!messageId) return { success: false, errors: [{ code: Constants.ERROR_ADD_MESSAGE_OUT, message: "failed to add message" }]};

                // message will be updated and saved
                let message = ctx.params.message;

                // set id's for referenced objects
                await this.setAppendixId({ message });

                // save message to folder messages of sender group
                try {
                    await this.putObject({ ctx, objectName: `~messages/${messageId}.message`, value: message });
                } catch (err) {
                    this.logger.debug("Failed to save message at sender");
                    return { success: false, errors: [{ code: 103, message: "failed to save message in folder" }]};
                }

                // check, if group is on whitelist of receiver
                let allowed = await this.connector.isAllowed({ owner: ctx.params.receiver, sender: owner });
                if (!allowed) return { success: false, errors: [{ code: Constants.ERROR_NOT_ACCEPTED, message: "not accepted by receiver" }]};

                // create message entry in receivers inbox
                let result = await this.connector.addMessage({ owner: ctx.params.receiver, box: Constants.INBOX, partner: owner, status: Constants.STATUS_RECEIVE, id: messageId });
                if (!result) return { success: false, errors: [{ code: Constants.ERROR_ADD_MESSAGE_IN, message: "failed to add message in receivers inbox" }]};

                // request access for receiver
                let meta;
                try {
                    meta = await this.getMeta({ ownerId: ctx.params.receiver });
                } catch (err) {
                    this.logger.debug("Failed to retrieve access token for receiver");
                    return { success: false, errors: [{ code: Constants.ERROR_REQUEST_ACCESS, message: "failed to retrieve access for receiver" }]};
                }

                // save referenced object to folder messages of receiver group and replace references by new ones
                try {
                    await this.sendAppendix({ ctx, receiver: { ownerId: ctx.params.receiver, meta }, messageId, message });
                } catch (err) {
                    this.logger.debug("Failed to save referenced objects at receiver");
                    return { success: false, errors: [{ code: Constants.ERROR_SAVE_APPENDIX_IN, message: "failed to save referenced objects at receiver" }]};
                }

                // save message to folder messages of receiver group
                try {
                    await this.putObject({ ctx: { meta }, objectName: `~messages/${messageId}.message`, value: message });
                } catch (err) {
                    this.logger.debug("Failed to save message at receiver");
                    return { success: false, errors: [{ code: Constants.ERROR_SAVE_MESSAGE_IN, message: "failed to save message at receiver" }]};
                }
                
                // confirm message sent
                result = await this.connector.updateStatus({ owner: ctx.params.receiver, status: Constants.STATUS_COMPLETE, id: messageId });
                if (!result) return { success: false, errors: [{ code: Constants.ERROR_CONFIRM_MESSAGE_SENT, message: "failed to update message status in receivers inbox" }]};
                result = await this.connector.updateStatus({ owner, status: Constants.STATUS_COMPLETE, id: messageId });
                if (!result) return { success: false, errors: [{ code: Constants.ERROR_CONFIRM_MESSAGE_SENT, message: "failed to update message status in senders outbox" }]};

                // return response
                return { success: true, messageId };
            }
        },
        
        /**
         * Get a message 
         * 
         * @param {String} messageId -   uuid
         * 
         * @returns {Object} result -   { data, errors }
         */
        get: {
            acl: "before",
            params: {
                messageId: { type: "uuid" }
            },
            async handler(ctx) {
                let owner = ctx.meta?.ownerId ?? null;
                if (!owner) return { success: false, errors: [{ code: Constants.ERROR_NOT_AUTHORIZED, message: "not authorized" }]};

                let result = {};
                try {
                    result.message = await this.getObject({ ctx, objectName: `~messages/${ctx.params.messageId}.message` });
                } catch (err) {
                    this.logger.debug("Failed to read message", { messageId: ctx.params.messageId });
                    return { success: false, errors: [{ code: Constants.ERROR_READ_MESSAGE, message: "failed to read message" }]};
                }

                return result;
            }
        },
        
        notify: {
            params: {
                notifyToken: { type: "string" },
                messageId: { type: "uuid" },
                senderId: { type: "uuid" },
                receiverId: { type: "uuid" },
                url: { type: "string" },
                fetchToken: { type: "string" },
                attachments: { type: "array", items: "uuid", optional: true }
            },
            async handler(ctx) {
                // TODO: verify notifytoken: must eb valid for receiverId and senderId
                // TODO: get group access token for receiver
                // TODO: emit event message.notify with messageId, senderId, url, fetchToken, attachments for group of receiver
            }
        },

        // TODO replace by fetchMessage
        receive: {
            acl: "before",
            params: {
                messageId: { type: "uuid" },
                senderId: { type: "uuid" },
                receiverId: { type: "uuid" },
                url: { type: "string" },
                fetchToken: { type: "string" },
                attachments: { type: "array", items: "uuid", optional: true },
                confirm: { type: "boolean", optional: true },
                path: { type: "string", optional: true }
            },
            async handler(ctx) {
                const path = ctx.params.path ?? Constants.INBOX_PATH;
                if (ctx.params.url === Constants.LOCAL_URL) {
                    const inStream = await this.actions.fetch({ fetchToken: ctx.params.fetchToken, messageId: ctx.params.messageId });
                    const outStream = await this.pipeStream({ ctx: ctx, objectName: `${ path }${ ctx.params.messageId}` });
                    inStream.pipe(outstream);
                } else {
                }
                // TODO: call url + fetch to receive message from sender
                // TODO: pipe stream to minio
                // TODO: loop through attachments
                // TODO: ... and get minio writeable stream for inbox of receiver
                // TODO: ... and request attachment from sender
                // TODO: ... and pipe stream to minio
                // TODO: emit event message.received
                // TODO: call url + confirm
            }
        },

        // TODO replace by fetchMessage
        fetch: {
            params: {
                fetchToken: { type: "string" },
                messageId: { type: "uuid" },
                attachmentId: { type: "uuid", optional: true }
            },
            async handler(ctx) {
                // TODO: verify fetchtoken
                // TODO: verify status of message
                // TODO: get group access token
                // TODO: get minio stream
                // TODO: pipe stream to response
            }
        },

        sendConfirmation: {
            acl: "before",
            params: {
                fetchToken: { type: "string" },
                messageId: { type: "uuid" }
            },
            async handler(ctx) {
            }
        },

        confirm: {
            params: {
                fetchToken: { type: "string" },
                messageId: { type: "uuid" }
            },
            async handler(ctx) {
                // TODO: verify fetchtoken
                // TODO Set status of message to confirmed
            }
        },

        /**
         * check, if group is on whitelist 
         * 
         * @returns {Boolean} result
         */
        isAllowed: {
            acl: "before",
            params: {
                address: { type: "string" } // internal: groupId, external: groupId#url
            },
            async handler(ctx) {
                let owner = ctx.meta?.ownerId ?? null;
                if (!owner) return { success: false, errors: [{ code: Constants.ERROR_NOT_AUTHORIZED, message: "not authorized" }]};

                // build hash
                const hash = await this.hash({ sender: owner, recipient: ctx.params.address });
                // check whitelist
                let result = await this.connector.checkWhiteList({ hash });
                return result;
            }
        },

        removeFromWhiteList: {
            acl: "before",
            params: {
                address: { type: "string" } // internal: groupId, external: groupId#url
            },
            async handler(ctx) {
                let owner = ctx.meta?.ownerId ?? null;
                if (!owner) return { success: false, errors: [{ code: Constants.ERROR_NOT_AUTHORIZED, message: "not authorized" }]};

                // build hash
                const hash = await this.hash({ sender: owner, recipient: ctx.params.address });
                // remove from whitelist
                let result = await this.connector.removeFromWhiteList({ hash });
                return result;
            }
        }

    },

    /**
     * Events
     */
    events: {

        /**
         * Listen to address book event AddressBookAddressAdded: add address to whitelist
         */
        AddressBookAddressAdded: {
            group: "exchange",
            params: {
                groupId: { type: "uuid" },
                address: { type: "string" } // internal: groupId, external: groupId#url
            },
            async handler(ctx) {
                // build hash
                const hash = await this.hash({ sender: ctx.params.groupId, recipient: ctx.params.address });
                // add to whitelist
                let result = await this.connector.addToWhiteList({ hash });
                if (!result) this.logger.error("Failed to add address to whitelist", { groupId: ctx.params.groupId, address: ctx.params.address });
            }
        },

        /**
         * Listen to address book event AddressBookAddressConfirmed: add address to whitelist
         * 
         * This event can be thrown by the address book, if the address is for some reasons not added to the whitelist
         * 
         */
        AddressBookAddressConfirmed: {
            group: "exchange",
            params: {
                groupId: { type: "uuid" },
                address: { type: "string" } // internal: groupId, external: groupId#url
            },
            async handler(ctx) {
                // build hash
                const hash = await this.hash({ sender: ctx.params.groupId, recipient: ctx.params.address });
                // add to whitelist
                let result = await this.connector.addToWhiteList({ hash });
                if (!result) this.logger.error("Failed to add address to whitelist", { groupId: ctx.params.groupId, address: ctx.params.address });
            }
        },

        /**
         * Listen to address book event AddressBookAddressAdded: add address to whitelist
         */
        AddressBookAddressRemoved: {
            group: "exchange",
            params: {
                groupId: { type: "uuid" },
                address: { type: "string" } // internal: groupId, external: groupId#url
            },
            async handler(ctx) {
                // build hash
                const hash = await this.hash({ sender: ctx.params.groupId, recipient: ctx.params.address });
                // add to whitelist
                let result = await this.connector.removeFromWhiteList({ hash });
                if (!result) this.logger.error("Failed to remove address from whitelist", { groupId: ctx.params.groupId, address: ctx.params.address });
            }
        }

    },

    /**
     * Methods
     */
    methods: {
        
        /**
         * Get meta data for group access
         */
        async getMeta({ ctx, ownerId }) {
            let accessToken;
            try {
                let res = await ctx.call(this.services.groups + ".requestAccessForService", { ownerId, service: this.name });
                if (res && res.token) accessToken = res.token;
            } catch (err) {
                this.logger.error("Failed to retrieve access token", { ownerId });
            }
            return {
                ownerId,
                acl: {
                    accessToken,
                    ownerId
                }
            };
        },

        /**
         * Walk through object and call function for each object
         */
        async iterate(o, key, f) {
            if( o[key] ){
                return await f(o[key]);
            }
            let result, p; 
            for (p in o) {
                // eslint-disable-next-line no-prototype-builtins
                if( o.hasOwnProperty(p) && typeof o[p] === "object" ) {
                    result = await this.iterate(o[p], key, f);
                    if(result){
                        return result;
                    }
                }
            }
            return result;
        },

        
        /**
         * replace referenced object path by uuid and collect referenced objects in appendix
         */
        async setAppendixId({ message }) {
            const copy = JSON.parse(JSON.stringify(message));
            const appendix = {};
            function addToAppendix(id, ref) {
                appendix[id] = JSON.parse(JSON.stringify(ref));
            }
            function setId(ref) {
                if (ref["object"]) ref.id = uuid();
                addToAppendix(ref.id, ref);
                delete ref["object"];
            }
            await this.iterate(copy, "#ref", setId);
            return { message:copy , appendix };
        },

        /**
         * emit notify event for receiver group
         */
        async emitNotifyEvent({ ctx, fetchToken, messageId, senderId, receiverId }) {

            // request group access
            const result = await ctx.call(this.services.groups + ".requestAccessForService", { groupId: receiverId, service: this.name  });
            if (!result || !result.accessToken) return { success: false, errors: [{ code: Constants.ERROR_NOT_ACCEPTED, message: "receiver not granted access" }]};

            // encrypt payload with group keys
            const data = { groupId: receiverId, notification: { _encrypt: { fetchToken, messageId, senderId, receiverId } } };
            const event = await ctx.call(this.services.groups + ".encryptValues", { data }, { acl: { accessToken: result.accessToken }});
            await this.broker.emit("ExchangeNotoficationReceived",event);
            return true;
        },

        //TODO replaced
        async sendAppendix({ ctx, receiver: { ownerId = null, meta = {} }, messageId, message }) {
            let self = this;
            async function pipe (ref) {
                if (!ref || !ref.object || !ref.id) return;
                let targetName = `~messages/${ messageId }.${ ref.id }`;
                self.logger.debug("copy appendix", { source: ref.object, receiver: ownerId, target: targetName });
                let source = await self.getStream({ ctx, objectName: ref.object });
                let target = await self.pipeStream({ ctx: { meta }, objectName: targetName });
                target.on("error", (err) => { 
                    self.logger.debug("error during streaming", { receiver: ownerId, targetName });
                    throw err;
                });
                await source.pipe(target);
            }
            await this.iterate(message, "#ref", pipe);
            // wait for encryption and zip
            await new Promise(resolve => setTimeout(resolve, 100));
        },
      
        /**
         * build hash from json
         */
        async hash(json) {
            let s = JSON.stringify(json);
            return createHash('sha256').update(s).digest('base64');
        },

        /**
         * return full address, also in case of groupId 
         */
        buildFullAddress(value) {
            if (typeof value === 'string' || value instanceof String) return value.indexOf("#") > 0 ? value : `${ value }#${ this.ownUrl }`;
        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 

        this.connector = new DB({ logger: this.broker.logger, options: this.settings?.db });

        this.ownUrl = process.env.EXCHANGE_URL || "localhost:8080/api/v1/exchange";

        this.axios = axios;

        // map service names and wait for services
        this.services = { 
            groups: this.settings?.services?.groups ?? "groups"
        };
        // await this.broker.waitForServices(Object.values(this.services));
  
    },

    /**
     * Service started lifecycle event handler
     */
    async started() { 

        // connect to db
        await this.connector.connect();

        /*
        const serviceId = process.env.SERVICE_ID;
        const authToken = process.env.SERVICE_AUTH_TOKEN;        
        const { serviceToken } = await this.broker.call(this.services.agents + ".login", { serviceId, authToken});
        if (!serviceToken) throw new Error("failed to login service");
        this.serviceToken = serviceToken;
        */
        
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() { 

        // disconnect from db
        await this.connector.disconnect();

    }

};