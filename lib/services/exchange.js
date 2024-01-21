/**
 * @license MIT, imicros.de (c) 2021 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraExchange");
const { Constants } = require("../classes/util/constants");
const { 
    UnvalidRequest,
    UnvalidFetchToken,
    AccessToReceiverNotGranted,
    FailedToRetrieveMessage
} = require("../classes/exceptions/exceptions");
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
            visibility: "public",
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
            visibility: "public",
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
                if (!result) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOT_ACCEPTED, message: "receiver not in white list" }]};

                // check for granted access (doesn't make sense to send without granted access)
                result = await ctx.call(this.services.groups + ".requestAccessForService", { groupId: owner, service: this.name  }, {});
                if (!result || !result.accessToken) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOT_ACCEPTED, message: "sender not granted access" }]};

                const messageId = uuid();
                const messageCode = ctx.params.messageCode;
                // replace references and build list of appendix
                const saveMessage = await this.setAppendixId({ message:ctx.params.message });

                // put message to outbox of sender as { message, appendix }
                this.putObject({ ctx, objectName: `~exchange/${messageId}.message`, value: saveMessage });

                // create fetch token
                const fetchToken = await this.vault.signToken({ 
                    type: Constants.TOKEN_TYPE_EXCHANGE_FETCH, 
                    // nodeID: ctx.broker.nodeID,
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
                        return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOTIFY, message: "failed to notify receiver" }]};
                    }
                } else {
                    // internal receiver: emit Event
                    const result = await this.emitNotifyEvent({ ctx, fetchToken, messageId, sender: this.buildFullAddress(owner), receiverId: ctx.params.receiver, messageCode });
                    if (!result) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOTIFY, message: "failed to notify receiver" }]};
                }
                return { success: true, messageId };
            }
        },

        /**
         * Notify about a new message (called externally)
         * 
         * @param {String} sender       -   full address of sender - e.g. 550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange
         * @param {String} receiver     -   full address of receiver - e.g. 550e8400-e29b-41d4-a716-446655440000#remote.host.de/api/v1/exchange
         * @param {String} messageId    -   message Id - should be unique for the sender 
         * @param {Number} messageCode  -   numeric code for the message type - this numeric code is used in the receiver group to identify the events to be triggered
         * @param {String} fetchToken   -   e.g. JSON Web Token with payload { type: "exchangeFetchToken", hash: "hash" }
         * 
         * @returns {Object} result -   { messageId, success, errors }
         */
        notify: {
            visibility: "published",
            params: {
                sender: { type: "string" },
                receiver: { type: "string" },
                messageId: { type: "uuid" },
                messageCode: { type: "number" },
                fetchToken: { type: "string" }
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const fetchToken = ctx.params.fetchToken;
                const [owner, ownUrl] = ctx.params.receiver.split("#");
                const sender = ctx.params.sender;
                const [senderId, senderUrl] = sender.split("#");

                // build hash - sender is receiver in this case
                const hash = await this.hash({ sender: owner, recipient: ctx.params.sender });
                // check whitelist
                let result = await this.connector.checkWhiteList({ hash });
                if (!result) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOT_ACCEPTED, message: "sender not in white list of receiver" }]};

                // verify fetch token
                const verifyUrl = "https://" + senderUrl + "/verify";
                try {
                    const result = await this.axios.post(verifyUrl,{
                        sender: ctx.params.sender, messageId, fetchToken
                    });
                    if(!result?.data?.success) throw new Error("failed to verify fetch token");
                } catch(e) {
                    // console.log(e);
                    return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_VERIFY, message: "failed to verify notification" }]};
                }

                // check for message - we should emit event for each message only once
                const hashMessage = await this.hash({ messageId, sender, receiverId: owner });
                const check = await this.connector.checkForMessage({ hash: hashMessage });
                if (check) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_MESSAGE_EXISTS, message: "message already received" }]};

                // emit group event
                const resultEmit = await this.emitNotifyEvent({ ctx, fetchToken, messageId, sender, receiverId: owner, messageCode: ctx.params.messageCode });
                if (!resultEmit) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOTIFY, message: "failed to notify receiver" }]};

                return { success: true, messageId };
            }
        },

        
        /**
         * Verify notification with fetch token (called externally)
         * 
         * @param {String} sender       -   full address of sender - e.g. 550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange
         * @param {String} messageId    -   message Id - as in sendMail / notify
         * @param {String} fetchToken   -   fetch token as created in sendMail and transferred in notify}
         * 
         * @returns {Object} result -   { messageId, success, errors }
         */
        verify: {
            visibility: "published",
            params: {
                sender: { type: "string" },
                messageId: { type: "uuid" },
                fetchToken: { type: "string" }
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const [owner, url] = ctx.params.sender.split("#");

                try {
                    // verify fetch token
                    const fetchToken = await this.vault.verifyToken(ctx.params.fetchToken);
                    if (!fetchToken) throw new Error("failed to verify fetch token");
                    const hash  = await this.hash({ messageId, owner });
                    if (fetchToken.hash !== hash) throw new Error("failed to verify fetch token");
                    return { success: true, messageId };
                } catch (err) { 
                    return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_VERIFY, message: "failed to verify notification" }]};
                }
            }
        },

        /**
         * fetch message (called externally)
         * 
         * @param {String} sender       -   full address of sender - e.g. 550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange as transferred in notify
         * @param {String} messageId    -   message Id - as transferred in notify
         * @param {String} fetchToken   -   fetch token as transferred in notify
         * 
         * @returns {Object} message    -   message object (always valid JSON)
         */
        fetchMessage: {
            visibility: "published",
            params: {
                sender: { type: "string" },
                messageId: { type: "uuid" },
                fetchToken: { type: "string" }
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const [owner, url] = ctx.params.sender.split("#");

                try {
                    // verify fetch token
                    const fetchToken = await this.vault.verifyToken(ctx.params.fetchToken);
                    if (!fetchToken) throw new Error("failed to verify fetch token");
                    const hash  = await this.hash({ messageId, owner });
                    if (fetchToken.hash !== hash) throw new UnvalidFetchToken();

                    // request group access
                    const result = await ctx.call(this.services.groups + ".requestAccessForService", { groupId: owner, service: this.name  });
                    // ... should at least not happen as the grant access is called before sending the message... but who knows
                    if (!result || !result.accessToken) throw new AccessToReceiverNotGranted();
                    
                    // get message
                    const newContext = { meta: { acl: { accessToken: result.accessToken } }};
                    const message = await this.getObject({ ctx: newContext, objectName: `~exchange/${messageId}.message` });
                    if (!message || !message.message) throw new FailedToRetrieveMessage();

                    // check for valid JSON
                    JSON.parse(JSON.stringify(message.message));

                    return message.message;

                } catch (err) { 
                    // console.log(err);
                    ctx.meta.$statusCode = 400; // bad request
                    if (err instanceof Exception) {
                        ctx.meta.$statusMessage = err.message;    
                    } else {
                        throw new UnvalidRequest();
                    }
                }
            }
        },

        /**
         * get message (called locally - based on notify event)
         * 
         * @param {String} sender       -   full address of sender - e.g. 550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange as transferred in notify
         * @param {String} messageId    -   message Id - as transferred in notify event
         * @param {String} fetchToken   -   fetch token as transferred in notify event
         * 
         * @returns {Object} message    -   message object (always valid JSON)
         */
        getMessage: {
            visibility: "public",
            params: {
                sender: { type: "string" },
                messageId: { type: "uuid" },
                fetchToken: { type: "string" }
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const [owner, url] = ctx.params.sender.split("#");

                // local call
                if (this.buildFullAddress(owner) === ctx.params.sender) {
                    this.logger.debug("local call", { sender: ctx.params.sender });

                    try {
                        // verify fetch token
                        const fetchToken = await this.vault.verifyToken(ctx.params.fetchToken);
                        if (!fetchToken) throw new Error("failed to verify fetch token");
                        const hash  = await this.hash({ messageId, owner });
                        if (fetchToken.hash !== hash) throw new UnvalidFetchToken();
    
                        // request group access
                        const result = await ctx.call(this.services.groups + ".requestAccessForService", { groupId: owner, service: this.name  });
                        // ... should at least not happen as the grant access is called before sending the message... but who knows
                        if (!result || !result.accessToken) throw new AccessToReceiverNotGranted();
                        
                        // get message
                        const newContext = { meta: { acl: { accessToken: result.accessToken } }};
                        const message = await this.getObject({ ctx: newContext, objectName: `~exchange/${messageId}.message` });
                        if (!message || !message.message) throw new FailedToRetrieveMessage();

                        // check for valid JSON
                        JSON.parse(JSON.stringify(message.message));

                        return message.message;
    
                    } catch (err) { 
                        throw new UnvalidRequest();
                    }
    

                // remote call
                } else {
                    this.logger.debug("Remote call", { sender: ctx.params.sender });
                    return this.actions.fetchMessage(ctx.params);
                }
            }
        },

        // TODO
        fetchAppendix: {
            visibility: "published",
            params: {
                sender: { type: "string" },
                messageId: { type: "uuid" },
                appendixId: { type: "uuid" },
                fetchToken: { type: "string" }                
            },
            async handler(ctx) {

                // TODO  create response stream 
            }
        },

        // TODO
        getAppendix: {
            visibility: "public",
            params: {
                sender: { type: "string" },
                messageId: { type: "uuid" },
                appendixId: { type: "uuid" },
                fetchToken: { type: "string" },
                path: { type: "string" }
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const [owner, url] = ctx.params.sender.split("#");

                // local call
                if (this.buildFullAddress(owner) === ctx.params.sender) {
                    this.logger.debug("local call", { sender: ctx.params.sender });


                // remote call
                } else {
                    this.logger.debug("Remote call", { sender: ctx.params.sender });
                    // TODO pipe remote call to path
                    return this.actions.fetchAppendix(ctx.params);
                }

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
        async emitNotifyEvent({ ctx, fetchToken, messageId, sender, receiverId }) {

            // request group access
            const result = await ctx.call(this.services.groups + ".requestAccessForService", { groupId: receiverId, service: this.name  });
            if (!result || !result.accessToken) return { success: false, errors: [{ code: Constants.ERROR_NOT_ACCEPTED, message: "receiver not granted access" }]};

            // encrypt payload with group keys
            const data = { groupId: receiverId, notification: { _encrypt: { fetchToken, messageId, sender, receiverId } } };
            const event = await ctx.call(this.services.groups + ".encryptValues", { data }, { acl: { accessToken: result.accessToken }});
            await this.broker.emit("ExchangeNotificationReceived",event);
            const hash = await this.hash({ messageId, sender, receiverId });
            await this.connector.addMessage({ hash });
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
         * return full address including host, if not already included
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