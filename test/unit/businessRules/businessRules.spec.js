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

        it("should deploy a business rule", async () => {
            let objectName = "path/to/example/UserConfirmationTemplates.dmn";
            let groupId = groups[0].uid;
            put(groupId,objectName, fs.readFileSync("./assets/UserConfirmationTemplates.dmn").toString());
            let result = await broker.call("businessRules.deploy", { objectName }, opts );
            expect(result).toBeDefined();
            expect(result).toEqual(true);
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