/**
 * @license MIT, imicros.de (c) 2021 Andreas Leinen
 */
"use strict";

const { DB } = require("../classes/db/cassandraExchange");
const { Constants } = require("../classes/util/constants");
const { 
    Exception,
    UnvalidRequest,
    SenderNotAllowedByReceiver,
    UnvalidFetchToken,
    AccessToReceiverNotGranted,
    AccessToSenderNotGranted,
    MessageAlreadyReceived,
    FailedToNotifyReceiver,
    FailedToRetrieveMessage,
    FailedToRetrieveAppendix
} = require("../classes/exceptions/exceptions");
const { v4: uuid } = require("uuid");
const { createHash } = require('crypto');
const jwt 	= require("jsonwebtoken");
const axios = require('axios');

// TODO ...delete
const util = require("util");

// TODO: remove direct call of groups service by provider
// TODO: call to groups provider with service id

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
                return await this.groups.grantServiceAccess({ ctx, serviceId: this.serviceId });
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
                messageCode: [{ type: "string" },{ type: "number" }],
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
                result = await this.groups.requestAccessForService({ groupId: owner, serviceId: this.serviceId  });
                if (!result || !result.accessToken) return { success: false, errors: [{ code: Constants.ERROR_EXCHANGE_NOT_ACCEPTED, message: "sender not granted access" }]};

                const messageId = uuid();
                const messageCode = ctx.params.messageCode;
                // replace references and build list of appendix
                const saveMessage = await this.setAppendixId({ message:ctx.params.message });

                // put message to outbox of sender as { message, appendix }
                this.store.putObject({ ctx, objectName: `~exchange/${messageId}.message`, value: saveMessage });

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
                messageCode: [{ type: "string" },{ type: "number" }],
                fetchToken: { type: "string" }
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const fetchToken = ctx.params.fetchToken;
                const [owner, receiverUrl] = ctx.params.receiver.split("#");
                const sender = ctx.params.sender;
                const [senderId, senderUrl] = sender.split("#");

                try {
                    // build hash - sender is receiver in this case
                    const hash = await this.hash({ sender: owner, recipient: ctx.params.sender });
                    // check whitelist
                    let result = await this.connector.checkWhiteList({ hash });
                    if (!result) throw new SenderNotAllowedByReceiver();

                    // verify fetch token
                    const verifyUrl = "https://" + senderUrl + "/verify";
                    try {
                        const result = await this.axios.post(verifyUrl,{
                            sender: ctx.params.sender, messageId, fetchToken
                        });
                        if(!result?.data?.success) throw new Error("failed to verify fetch token");
                    } catch(e) {
                        throw new UnvalidFetchToken();
                    }

                    // check for message - we should emit event for each message only once
                    const hashMessage = await this.hash({ messageId, sender, receiverId: owner });
                    const check = await this.connector.checkForMessage({ hash: hashMessage });
                    if (check) throw new MessageAlreadyReceived();

                    // emit group event
                    const resultEmit = await this.emitNotifyEvent({ ctx, fetchToken, messageId, sender, receiverId: owner, messageCode: ctx.params.messageCode });
                    if (!resultEmit) throw new FailedToNotifyReceiver();

                    return { success: true, messageId };
                } catch (err) {
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
                    const result = await this.groups.requestAccessForService({ groupId: owner, serviceId: this.serviceId  });
                    // ... should at least not happen as the grant access is called before sending the message... but who knows
                    if (!result || !result.accessToken) throw new AccessToReceiverNotGranted();
                    
                    // get message
                    const newContext = { meta: { acl: { accessToken: result.accessToken } }};
                    const message = await this.store.getObject({ ctx: newContext, objectName: `~exchange/${messageId}.message` });
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
                if (this.isLocal(url)) {
                    this.logger.debug("local call", { sender: ctx.params.sender });

                    try {
                        // verify fetch token
                        const fetchToken = await this.vault.verifyToken(ctx.params.fetchToken);
                        if (!fetchToken) throw new Error("failed to verify fetch token");
                        const hash  = await this.hash({ messageId, owner });
                        if (fetchToken.hash !== hash) throw new UnvalidFetchToken();
    
                        // request group access
                        const result = await this.groups.requestAccessForService({ groupId: owner, serviceId: this.serviceId  });
                        // ... should at least not happen as the grant access is called before sending the message... but who knows
                        if (!result || !result.accessToken) throw new AccessToSenderNotGranted();
                        
                        // get message
                        const newContext = { meta: { acl: { accessToken: result.accessToken } }};
                        const message = await this.store.getObject({ ctx: newContext, objectName: `~exchange/${messageId}.message` });
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

                    const fetchUrl = "https://" + url + "/fetchMessage";
                    try {
                        const result = await this.axios.post(fetchUrl,{
                            sender: ctx.params.sender, 
                            messageId: ctx.params.messageId, 
                            fetchToken: ctx.params.fetchToken
                        });
                        if (!result || !result.status || result.status != 200) throw new FailedToRetrieveMessage();
                        return result.data;
                    } catch(err) {
                        throw new FailedToRetrieveMessage();
                    }

                }
            }
        },

        /**
         * fetch appendix (called externally)
         * 
         * @param {String} sender       -   full address of sender - e.g. 550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange as transferred in notify
         * @param {Uuid} messageId      -   message Id - as transferred in notify
         * @param {Uuid} appendixId     -   appendix Id - as transferred in #ref links of message
         * @param {String} fetchToken   -   fetch token as transferred in notify
         * 
         * @returns {Stream} stream     -   stream with object data
         */
        fetchAppendix: {
            visibility: "published",
            params: {
                sender: { type: "string" },
                messageId: { type: "uuid" },
                appendixId: { type: "uuid" },
                fetchToken: { type: "string" }                
            },
            async handler(ctx) {
                const messageId = ctx.params.messageId;
                const [owner, url] = ctx.params.sender.split("#");
                const appendixId = ctx.params.appendixId;

                try {
                    // request group access for sender 
                    const result = await this.groups.requestAccessForService({ groupId: owner, serviceId: this.serviceId  });
                    // ... should at least not happen as the grant access is called before sending the message... but who knows
                    if (!result || !result.accessToken) throw new AccessToSenderNotGranted();

                    // get message appendix
                    const newContext = { meta: { acl: { accessToken: result.accessToken } }};
                    const message = await this.store.getObject({ ctx: newContext, objectName: `~exchange/${messageId}.message` });
                    if (!message || !message.appendix) throw new FailedToRetrieveAppendix();

                    // get object from appendix
                    const ref = message.appendix[appendixId];
                    if(!ref || !ref.object) throw new FailedToRetrieveAppendix();

                    return await this.store.getStream({ ctx: newContext, objectName: ref.object });
                } catch (err) {
                    this.logger.debug("Failed to read message appendix", { messageId, appendixId, err });
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
         * get appendix (called locally)
         * 
         * @param {String} sender       -   full address of sender - e.g. 550e8400-e29b-41d4-a716-446655440000#dev.imicros.de/api/v1/exchange as transferred in notify
         * @param {Uuid} messageId      -   message Id - as transferred in notify
         * @param {Uuid} appendixId     -   appendix Id - as transferred in #ref links of message
         * @param {String} fetchToken   -   fetch token as transferred in notify
         * @param {String} path         -   path to store the appendix
         * 
         * @returns {Object} result     -   { success }
         */
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
                const targetName = ctx.params.path;
                const appendixId = ctx.params.appendixId;

                // function to pipe stream from source to target waiting for finish
                const self = this;
                async function pipe (source,target) {
                    return new Promise((resolve, reject) => {
                        target.on("error", (err) => { 
                            self.logger.debug("error during streaming", { receiver: ctx?.meta?.ownerId, targetName });
                            throw err;
                        });
                        target.on("finish", () => {
                            return resolve();
                        });                            
                        target.on("end", () => {
                            return resolve();
                        });                            
                        source.pipe(target);
                    });
                }

                // local call
                if (this.isLocal(url)) {
                    this.logger.debug("local call", { sender: ctx.params.sender });

                    try {
                        // request group access for sender 
                        const result = await this.groups.requestAccessForService({ groupId: owner, serviceId: this.serviceId  });
                        // ... should at least not happen as the grant access is called before sending the message... but who knows
                        if (!result || !result.accessToken) throw new AccessToSenderNotGranted();

                        // get object path from appendix
                        const newContext = { meta: { acl: { accessToken: result.accessToken } }};
                        const message = await this.store.getObject({ ctx: newContext, objectName: `~exchange/${messageId}.message` });
                        if (!message || !message.appendix) throw new FailedToRetrieveAppendix();

                        // get object from appendix
                        const ref = message.appendix[appendixId];
                        if(!ref || !ref.object) throw new FailedToRetrieveAppendix();

                        // get local source stream
                        const source = await this.store.getStream({ ctx: newContext, objectName: ref.object });
                        // get local target stream
                        const target = await this.store.pipeStream({ ctx, objectName: targetName });

                        // pipe source to target and wait for finish
                        await pipe(source,target);
                        return { success: true };
                    } catch (err) {
                        this.logger.debug("Failed to read message appendix", { messageId, appendixId, err });
                        throw new UnvalidRequest();
                    }

                // remote call
                } else {
                    this.logger.debug("Remote call", { sender: ctx.params.sender });

                    try {
                        const fetchUrl = "https://" + url + "/fetchAppendix";
                        const result = await this.axios.post(fetchUrl,{
                            sender: ctx.params.sender, 
                            messageId: ctx.params.messageId, 
                            appendixId: ctx.params.appendixId,
                            fetchToken: ctx.params.fetchToken
                        });
                        if (!result || !result.status || result.status != 200) throw new FailedToRetrieveAppendix();

                        // get remote source stream
                        const source = result.data
                        // get local target stream
                        const target = await this.store.pipeStream({ ctx, objectName: targetName });

                        // pipe source to target and wait for finish
                        await pipe(source,target);
                        return { success: true };
                    } catch (err) {
                        this.logger.debug("Failed to read message appendix", { messageId, appendixId, err });
                        throw new UnvalidRequest();
                    }

                }

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
            await this.iterate(copy, "_ref", setId);
            return { message:copy , appendix };
        },

        /**
         * emit notify event for receiver group
         */
        async emitNotifyEvent({ ctx, fetchToken, messageId, sender, receiverId, messageCode }) {

            // request group access
            const result = await this.groups.requestAccessForService({ groupId: receiverId, serviceId: this.serviceId  });
            if (!result || !result.accessToken) return { success: false, errors: [{ code: Constants.ERROR_NOT_ACCEPTED, message: "receiver not granted access" }]};

            // assign unique id and encrypt notification with group key
            const data = { 
                groupId: receiverId, 
                notificationId: uuid(), 
                notification: { 
                    _encrypt: { fetchToken, messageId, sender, receiverId, messageCode }
                }
            };
            const encryptedData = await this.groups.encryptValues({ accessToken: result.accessToken, data });
            // await this.broker.emit("ExchangeNotificationReceived",event);
            await this.queue.add({
                topic: Constants.QUEUE_TOPIC_MESSAGES, 
                key: receiverId,
                event: Constants.QUEUE_MESSAGE_NOTIFIED,
                data: encryptedData
            });
            const hash = await this.hash({ messageId, sender, receiverId });
            await this.connector.addMessage({ hash });
            return true;
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
        },

        /**
         * check, if url is local host
         */
        isLocal(url) {
            return url === this.ownUrl;
        }

    },

    /**
     * Service created lifecycle event handler
     */
    async created() { 

        if (!this.store) throw new Error("Store provider must be injected first");
        if (!this.queue) throw new Error("Queue provider must be injected first");

        this.serviceId = process.env.SERVICE_ID_EXCHANGE;

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