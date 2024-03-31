const { ServiceBroker } = require("moleculer");
const { DB } = require("../../../lib/classes/db/cassandraFlow");
const { Parser } = require("../../../lib/classes/flow/parser");
const { VaultServiceAccess } = require("../../../lib/classes/provider/vault");
const { GroupsServiceAccess } = require("../../../lib/classes/provider/groups");
const { v4: uuid } = require("uuid");

// helper & mocks
const jestConsole = console;
const { StoreServiceMock, put, get } = require("../../mocks/store");
const { GroupsServiceMock } = require("../../mocks/groups");
const { VaultServiceMock } = require("../../mocks/vault");
const fs = require("fs");
const exp = require("constants");

const settings = {
    db: { 
        contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
        datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
        keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow"
    } 
}

describe("Test database connection", () => {
    let broker, db, serviceId = uuid(), accessToken, xmlData, parsedData, userId = uuid(), owner = [uuid(),uuid()];

    beforeAll(() => {
        time = new Date(Date.now())
    })

    beforeEach(() => {
        opts = { meta: { user: { id: userId , email: `${userId}@host.com` } , ownerId: owner[0], acl: { ownerId: owner[0] } }};
        global.console = require('console');        
    });
    
    afterEach(() => {
        global.console = jestConsole;        
    });

    describe("Test database initialization", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares:  [AclMiddleware({ service: "acl" })],
                logger: console,
                logLevel: "info" //"debug"
            });
            [GroupsServiceMock, VaultServiceMock, StoreServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(broker).toBeDefined();
        });

        it("it should initialize the connector and connect to database", async () => {
            const vault = new VaultServiceAccess({ 
                broker: broker,
                logger: broker.logger,
                options: {} 
            })
            const groups = new GroupsServiceAccess({
                broker: broker,
                logger: broker.logger,
                vault: vault,
                options: {} 
            });
            db = new DB({logger: broker.logger, groups, options: settings.db });
            accessToken = await groups.requestAccessForService({ groupId: owner[0], serviceId }).accessToken;
            await db.connect();
            expect(db instanceof DB).toEqual(true);
            expect(db.groups instanceof GroupsServiceAccess).toEqual(true);
            expect(db.groups.vault instanceof VaultServiceAccess).toEqual(true);
        }, 30000);

    });

    describe("Test parser class", () => {
        it("it should parse the process", async () => {
            const parser = new Parser({ broker });
            expect(parser).toBeDefined();
            expect(parser instanceof Parser).toEqual(true);
            xmlData = fs.readFileSync("assets/UserConfirmationRequested.bpmn");
            const id = uuid();
            const objectName = "Process Example";
            parsedData = parser.parse({id, xmlData, objectName, ownerId: owner[0]});
            expect(parsedData).toBeDefined();
            expect(parsedData.process.id).toEqual(id);
            expect(parsedData.process.name).toEqual(objectName);
        });
    });

    describe("Test database connector", () => {
        let objectIds = [uuid(),uuid()];
        let object = {
            test: "test",
            value: 123,
            date: new Date().toString(),
            now: Date.now(),
            deep: {
                nested: "nested"
            }
        }

        it("it should deploy a process", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
                xmlData: xmlData.toString(), 
                parsedData, 
                attributes: {
                    name: parsedData.process.name,
                    version: parsedData.version.name,
                    created: parsedData.version.created
                }
            };
            return db.saveProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    processId: parsedData.process.id,
                    versionId: parsedData.version.id
                });
            });
            
        });

        it("it should retrieve the process again", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
            };
            return db.getProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res.parsedData).toEqual(parsedData);
            });
            
        });

        it("it should retrieve the xml of the process", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                processId: parsedData.process.id, 
                versionId: parsedData.version.id, 
                xml: true
            };
            return db.getProcess(params).then(res => {
                expect(res).toBeDefined();
                expect(res.xmlData).toEqual(xmlData.toString());
            });
            
        });

        it("it should retrieve the process list", () => {
            let params = {
                owner: owner[0], 
                accessToken
            };
            return db.getVersionList(params).then(res => {
                expect(res).toBeDefined();
                expect(res.length).toEqual(1);
                expect(res[0].processId).toEqual(parsedData.process.id);
                expect(res[0].versionId).toEqual(parsedData.version.id);
                expect(res[0].name).toEqual(parsedData.process.name);
                expect(res[0].deployedAt).toEqual(expect.any(Date));
                expect(res[0].activeInstances.length).toEqual(0);
            });
            
        });

        it("it should store an object", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                objectId: objectIds[0], 
                data: object
            };
            return db.saveObject(params).then(res => {
                expect(res).toBeDefined();
                expect(res.objectId).toEqual(params.objectId);
            });
            
        });

        it("it should retrieve an object again", () => {
            let params = {
                owner: owner[0], 
                accessToken, 
                objectId: objectIds[0]
            };
            return db.getObject(params).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(object);
            });
            
        });

    });

    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await db.disconnect();
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});
    