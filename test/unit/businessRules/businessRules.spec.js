"use strict";

const { ServiceBroker } = require("moleculer");
const { BusinessRulesService } = require("../../../index");
const { StoreProvider } = require("../../../lib/provider/store");
const { GroupsProvider } = require("../../../lib/provider/groups");
const { VaultProvider } = require("../../../lib/provider/vault");

// helper & mocks
const { StoreServiceMock, put } = require("../../mocks/store");
const { groups } = require("../../helper/shared");
const { GroupsServiceMock, getTestAccessToken } = require("../../mocks/groups");
const { VaultServiceMock } = require("../../mocks/vault");
const fs = require("fs");
const { v4: uuid } = require("uuid");

describe("Test business rules service", () => {

    let broker, service, opts = {}, userId = uuid(), accessToken ;
    
    beforeAll(() => {
        accessToken = getTestAccessToken(userId);
        opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: groups[0].uid, acl: { ownerId: groups[0].uid, accessToken } , accessToken }};
    });
    
    afterAll(() => {
    });
    
    beforeEach(() => {
    });
    
    afterEach(() => {
    });

    describe("Test create service", () => {

        it("should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            service = broker.createService({ 
                name: "businessRules",
                mixins: [BusinessRulesService, StoreProvider, GroupsProvider, VaultProvider],
                dependencies: ["v1.groups"],
                settings: {
                    db: { 
                        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
                        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
                        keyspace: process.env.CASSANDRA_KEYSPACE_DECISION || "imicros_decision"
                    } 
                }
            });
            // Start additional services
            [StoreServiceMock, GroupsServiceMock, VaultServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(service).toBeDefined();
        });

    });

    describe("Test service", () => {
        let xmlData = fs.readFileSync("./assets/UserConfirmationTemplates.dmn").toString();

        it("should deploy a business rule", async () => {
            let objectName = "path/to/example/UserConfirmationTemplates.dmn";
            let groupId = groups[0].uid;
            put(groupId,objectName, xmlData);
            let result = await broker.call("businessRules.deploy", { objectName }, opts );
            expect(result).toBeDefined();
        });

        it("should read the business rule again", async () => {
            let result = await broker.call("businessRules.get", { businessRuleId: "UserConfirmationTemplates" }, opts );
            expect(result).toBeDefined();
            expect(result.xmlData).toEqual(xmlData);
            expect(result.parsed).toBeDefined();
            expect(result.parsed.id).toEqual("UserConfirmationTemplates");
            expect(result.parsed.name).toEqual("User Confirmation Templates");
            expect(typeof result.parsed.ast).toEqual("object");
        });

        it("should evaluate a business rule", async () => {
            let context = {
                "locale": "en-US",
            };
            let result = await broker.call("businessRules.evaluate", { businessRuleId: "UserConfirmationTemplates", context }, opts );
            expect(result).toBeDefined();
            expect(result).toEqual({
                'Determine User Confirmation Templates': {
                  subject: 'User Confirmation Subject en-US',
                  body: 'User Confirmation Body en-US'
                }
            });
        });

        it("should get a list of business rules", async () => {
            let result = await broker.call("businessRules.getList", {}, opts );
            expect(result).toBeDefined();
            expect(result.length).toEqual(1);
            expect(result[0].businessRuleId).toEqual("UserConfirmationTemplates");
        });

        it("should delete a business rule", async () => {
            let result = await broker.call("businessRules.delete", { businessRuleId: "UserConfirmationTemplates" }, opts );
            expect(result).toBeDefined();
        });

        it("should get an empty list of business rules", async () => {
            let result = await broker.call("businessRules.getList", {}, opts );
            expect(result).toBeDefined();
            expect(result.length).toEqual(0);
        });

        it("should get events of a business rule", async () => {
            let result = await broker.call("businessRules.getEvents", { businessRuleId: "UserConfirmationTemplates" }, opts );
            expect(result).toBeDefined();
            expect(result.length).toEqual(2);
            expect(result).toContainEqual({ event: "saved", time: expect.any(Date), accessToken, parsed: { id: "UserConfirmationTemplates", name: "User Confirmation Templates", ast: expect.any(Object) }, xmlData });
            expect(result).toContainEqual({ event: "deleted", time: expect.any(Date), accessToken, businessRuleId: "UserConfirmationTemplates" });
        });

    });

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});