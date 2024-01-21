"use strict";

const { ServiceBroker } = require("moleculer");
const { ExchangeService } = require("../../../index");
const { v4: uuid } = require("uuid");
const { Constants } = require("../../../lib/classes/util/constants");
const { Vault } = require("../../../lib/provider/vault");
const axios = require('axios');

// helper & mocks
//const { Agents } = require("../../helper/agents");
const { credentials } = require("../../helper/credentials");
const { StoreMixin, put, get } = require("../../mocks/store.mixin");
const { Collect, events, initEvents } = require("../../helper/collect");
const { Groups } = require("../../mocks/groups");
const { VaultMock } = require("../../helper/vault");

// mock axios
jest.mock("axios");

const localReceivers = [uuid(), uuid(), uuid()];
const remoteHost = "my-own-server-url.de";
const remoteReceivers = [uuid()+`#${ remoteHost}`, uuid()+`#${ remoteHost}`, uuid()+`#${ remoteHost}`];
const message = {
    a: {
        deeplink: {
            "#ref": {
                object: "my/deep/path/object1.txt",
                label: "Object 1"
            }
        }
    },
    link: {
        "#ref": {
            object: "object2.txt",
            label: "Object 2"
        }
    }
}


describe("Test exchange service", () => {

    let broker, service;
    let opts, userId = uuid(), groupId = uuid();
    let sender = [{ id: uuid(), label: "first sender" }, { id: credentials.partnerId, label: "second sender" }];

    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug" // "info" //"debug"
            });
            service = await broker.createService({
                name: "exchange",
                //mixins: [Store()],
                mixins: [Vault, ExchangeService, StoreMixin()],
                dependencies: ["v1.groups"],
                settings: { 
                    db: {
                        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                        keyspace: process.env.CASSANDRA_KEYSPACE_EXCHANGE || "imicros_exchange" 
                    },
                    services: {
                        groups: "v1.groups"
                    },
                    vault: {
                        service: "v1.vault"
                    }
                }    
            });
            // Start additional services
            [Groups, VaultMock,Collect].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(service).toBeDefined();
        });

    });

    describe("Test grant access", () => {

        beforeEach(() => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: groupId, acl: { ownerId: groupId } }};
        });

        it("it should grant access", () => {
            let params = {};
            return broker.call("exchange.grantAccess", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should grant access for local recipient", () => {
            let params = {};
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: localReceivers[0], acl: { ownerId: localReceivers[0] } }};
            return broker.call("exchange.grantAccess", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

    });

    describe("Test whitelist ", () => {

        beforeEach(() => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: groupId, acl: { ownerId: groupId } }};
        });

        it("it should return false for unknown local recipient", () => {
            let params = {
                address: localReceivers[0]
            };
            return broker.call("exchange.isAllowed", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(false);
            });
        });

        it("it should return false for unknown remote recipient", () => {
            let params = {
                address: remoteReceivers[0]
            };
            return broker.call("exchange.isAllowed", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(false);
            });
        });

        it("it should add local recipients to the white list", async () => {
            let params = {
                groupId,
                address: localReceivers[0]
            };
            await broker.emit("AddressBookAddressAdded", params);
            params.address = localReceivers[1];
            await broker.emit("AddressBookAddressAdded", params);
        });

        it("it should add remote recipients to the white list", async () => {
            let params = {
                groupId,
                address: remoteReceivers[0]
            };
            await broker.emit("AddressBookAddressAdded", params);
            params.address = remoteReceivers[1];
            await broker.emit("AddressBookAddressAdded", params);
        });

        it("it should return true for known local recipient", () => {
            let params = {
                address: localReceivers[1]
            };
            return broker.call("exchange.isAllowed", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should return true for known remote recipient", () => {
            let params = {
                address: remoteReceivers[0]
            };
            return broker.call("exchange.isAllowed", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should remove a local recipient from the white list", async () => {
            let params = {
                groupId,
                address: localReceivers[1]
            };
            await broker.emit("AddressBookAddressRemoved", params);
        });

        it("it should return false for the removed local recipient", () => {
            let params = {
                address: localReceivers[1]
            };
            return broker.call("exchange.isAllowed", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(false);
            });
        });


    });

    describe("Test send message ", () => {

        let notifyCall = {}, notifyEventLocal = {}, notifyEventRemote = {};

        beforeEach(() => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: groupId, acl: { ownerId: groupId } }};
            initEvents();
        });

        it("it should throw error - sender not granted access", () => {
            const otherGroupId = uuid();
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: otherGroupId, acl: { ownerId: otherGroupId } }};
            let params = {
                receiver: remoteReceivers[0],
                message
            };
            return broker.call("exchange.sendMessage", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(false);
                expect(res.errors).toBeDefined();
                //console.log(res.errors[0]);
                expect(res.errors[0].code).toBeDefined();
                expect(res.errors[0].code).toEqual(Constants.ERROR_EXCHANGE_NOT_ACCEPTED);
            });
        });

        it("it should emit notify event for a local address", () => {
            let params = {
                receiver: localReceivers[0],
                message
            };
            return broker.call("exchange.sendMessage", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(true);
                expect(res.messageId).toBeDefined();
                const stored = get(`~exchange/${res.messageId}.message`);
                expect(stored).toBeDefined();
                expect(stored.message.a.deeplink["#ref"].id).toBeDefined();
                expect(stored.message.a.deeplink["#ref"].label).toEqual(params.message.a.deeplink["#ref"].label);
                expect(stored.message.a.deeplink["#ref"].object).not.toBeDefined();
                expect(stored.appendix[stored.message.a.deeplink["#ref"].id].object).toEqual(params.message.a.deeplink["#ref"].object);
                expect(events["ExchangeNotificationReceived"]).toBeDefined();
                expect(events["ExchangeNotificationReceived"].length).toEqual(1);
                // console.log(events["ExchangeNotificationReceived"][0]);
                expect(events["ExchangeNotificationReceived"][0].payload.notification._encrypted).toBeDefined();
                notifyEventLocal = events["ExchangeNotificationReceived"][0].payload;
            });
        });

        it("it should decrypt the notification event", async () => {
            let params = {
                data: notifyEventLocal
            };
            const event = await broker.call("v1.groups" + ".decryptValues", params, { meta: { acl: { ownerId:localReceivers[0] }, test: { service: "exchange" } } });
            // console.log(event);
            notifyEventLocal = event;
        });

        it("it should call notify at remote server", () => {
            let params = {
                receiver: remoteReceivers[0],
                message
            };
            let callParams;
            axios.post.mockImplementationOnce((url,data) => { callParams = data; return Promise.resolve({ status: 200, data: { success: true } }); });
            //axios.post.mockResolvedValue({ status: 200, data: { success: true } });
            return broker.call("exchange.sendMessage", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(true);
                expect(res.messageId).toBeDefined();
                const stored = get(`~exchange/${res.messageId}.message`);
                expect(stored).toBeDefined();
                expect(stored.message.a.deeplink["#ref"].id).toBeDefined();
                expect(stored.message.a.deeplink["#ref"].label).toEqual(params.message.a.deeplink["#ref"].label);
                expect(stored.message.a.deeplink["#ref"].object).not.toBeDefined();
                expect(stored.appendix[stored.message.a.deeplink["#ref"].id].object).toEqual(params.message.a.deeplink["#ref"].object);
                expect(axios.post).toHaveBeenCalledWith(
                    `https://${remoteHost}/notify`,
                    expect.objectContaining({
                        sender: expect.any(String),
                        receiver: remoteReceivers[0],
                        messageId: expect.any(String),
                        messageCode: 0,
                        fetchToken: expect.any(String)
                    }),
                  );
                // console.log(axios.post.mock.calls[0][1]);
                notifyCall = axios.post.mock.calls[0][1];
            });
        });

        it("it should verify the fetch token", () => {
            let params = {
                sender: notifyCall.sender,
                messageId: notifyCall.messageId,
                fetchToken: notifyCall.fetchToken
            };
            return broker.call("exchange.verify", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(true);
                expect(res.messageId).toEqual(notifyCall.messageId);
            });
        });

        it("it should fetch the message", () => {
            let params = {
                sender: notifyCall.sender,
                messageId: notifyCall.messageId,
                fetchToken: notifyCall.fetchToken
            };
            return broker.call("exchange.fetchMessage", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.a.deeplink["#ref"].id).toBeDefined();
                expect(res.a.deeplink["#ref"].label).toEqual(message.a.deeplink["#ref"].label);
                expect(res.a.deeplink["#ref"].object).not.toBeDefined();
            });
        });

        it("it should fetch the message locally via get message", () => {
            let params = {
                sender: notifyCall.sender,
                messageId: notifyCall.messageId,
                fetchToken: notifyCall.fetchToken
            };
            return broker.call("exchange.getMessage", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.a.deeplink["#ref"].id).toBeDefined();
                expect(res.a.deeplink["#ref"].label).toEqual(message.a.deeplink["#ref"].label);
                expect(res.a.deeplink["#ref"].object).not.toBeDefined();
            });
        });

        it("it should call verify at remote server and then emit event", () => {
            let params = {
                sender: remoteReceivers[0],
                receiver: `${ groupId }#${ remoteHost }`,
                messageId: uuid(),
                messageCode: 210,
                fetchToken: uuid()
            }  
            axios.post.mockImplementationOnce(() => Promise.resolve({ status: 200, data: { success: true } }));
            return broker.call("exchange.notify", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(true);
                expect(res.messageId).toEqual(params.messageId);
                expect(axios.post).toHaveBeenCalledWith(
                    `https://${remoteHost}/verify`,
                    expect.objectContaining({
                        sender: params.sender,
                        messageId: params.messageId,
                        fetchToken: params.fetchToken
                    }),
                  );
                expect(events["ExchangeNotificationReceived"]).toBeDefined();
                expect(events["ExchangeNotificationReceived"].length).toEqual(1);
                // console.log(events["ExchangeNotificationReceived"][0]);
                expect(events["ExchangeNotificationReceived"][0].payload.notification._encrypted).toBeDefined();
              })
        });

        it("it should not verify the fetch token, due to an wrong message Id", () => {
            let params = {
                sender: notifyCall.sender,
                messageId: uuid(),
                fetchToken: notifyCall.fetchToken
            };
            return broker.call("exchange.verify", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(false);
                expect(res.errors).toBeDefined();
                expect(res.errors).toContainEqual({ code: Constants.ERROR_EXCHANGE_VERIFY, message: "failed to verify notification" });
            });
        });

        it("it should throw error - receiver not in white list", () => {
            let params = {
                receiver: remoteReceivers[2],
                message
            };
            return broker.call("exchange.sendMessage", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.success).toEqual(false);
                expect(res.errors).toBeDefined();
                //console.log(res.errors[0]);
                expect(res.errors[0].code).toBeDefined();
                expect(res.errors[0].code).toEqual(Constants.ERROR_EXCHANGE_NOT_ACCEPTED);
            });
        });



    });


    /*

    describe("Test messages ", () => {

        let messageId;

        beforeEach(() => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` }, ownerId: groupId, acl: { ownerId: groupId } } };
        });

        it("it should send a simple message", () => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` }, ownerId: credentials.partnerId, acl: { ownerId: credentials.partnerId } } };
            let params = {
                receiver: groupId,
                message: {
                    a: 5,
                    b: 6
                }
            };
            return broker.call("messages.send", params, opts).then(res => {
                expect(res).toBeDefined();
                console.log(res);
                console.log(store);
                expect(res.success).toEqual(true);
                expect(res.messageId).toBeDefined();
                messageId = res.messageId;
            });
        });

        it("it should get the message by sender", () => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` }, ownerId: credentials.partnerId, acl: { ownerId: credentials.partnerId } } };
            let params = {
                messageId
            };
            return broker.call("messages.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.message).toBeDefined();
                expect(res.message).toEqual({ a: 5, b: 6 });
            });
        });

        it("it should get the message by receiver", () => {
            let params = {
                messageId
            };
            return broker.call("messages.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.message).toBeDefined();
                expect(res.message).toEqual({ a: 5, b: 6 });
                console.log(res.message);
            });
        });

        it("it should send a message with referenced objects", () => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` }, ownerId: credentials.partnerId, acl: { ownerId: credentials.partnerId } } };
            let params = {
                receiver: groupId,
                message: {
                    a: {
                        deeplink: {
                            "#ref": {
                                object: "object1.txt",
                                label: "Object 1"
                            }
                        }
                    },
                    link: {
                        "#ref": {
                            object: "object2.txt",
                            label: "Object 2"
                        }
                    }
                }
            };
            return broker.call("messages.send", params, opts).then(res => {
                expect(res).toBeDefined();
                console.log(res);
                console.log(store);
                expect(res.success).toEqual(true);
            });
        });

        it("it should get the messages by receiver", () => {
            let params = {
                search: {
                    inbox: true,
                    outbox: true,
                    time: {
                        from: new Date(Date.now()-10000),   // - 10 s
                        to: new Date(Date.now()+10000)      // + 10 s
                    }
                }
            };
            return broker.call("messages.list", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.data).toBeDefined();
                expect(res.data.length).toEqual(2);
                console.log(res.data);
            });
        });

        it("it should get empty messages list due to unselected inbox", () => {
            let params = {
                search: {
                    inbox: false,
                    outbox: true
                }
            };
            return broker.call("messages.list", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.data).toBeDefined();
                expect(res.data.length).toEqual(0);
            });
        });

        it("it should get the messages by sender", () => {
            opts = { meta: { user: { id: userId , email: `${userId}@host.com` }, ownerId: credentials.partnerId, acl: { ownerId: credentials.partnerId } } };
            let params = {
                search: {
                    inbox: true,
                    outbox: true
                }
            };
            return broker.call("messages.list", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.data).toBeDefined();
                expect(res.data.length).toEqual(2);
                console.log(res.data);
            });
        });

    });
        
    */

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });    
    
});