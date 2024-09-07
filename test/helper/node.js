const { ServiceBroker } = require("moleculer");

const { UsersService: UsersBasic } = require("../../index");
const { GroupsService: GroupsBasic } = require("../../index");
const { AgentsService: AgentsBasic } = require("../../index");
const { AdminService: AdminBasic } = require("../../index");
const { KeysService } = require("../../index");
const { VaultService: VaultBasic } = require("../../index");
const { StoreService: StoreBasic }  = require("../../index");
const { TemplateService: TemplateBasic } = require("../../index");
const { SmtpService: SmtpBasic } = require("../../index");
const { FlowService: FlowBasic } = require("../../index");
const { BusinessRulesService: BusinessRulesBasic } = require("../../index");
const { QueueService: QueueBasic } = require("../../index");
const { WorkerService } = require("../../index");
const VaultHelper = require("./vault");

const { Serializer } = require("../../lib/provider/serializer");
const { Publisher } = require("../../lib/provider/publisher");
const { Encryption } = require("../../lib/provider/encryption");

const { KeysProvider } = require("../../index");
const { VaultProvider } = require("../../lib/provider/vault");
const { GroupsProvider } = require("../../lib/provider/groups");
const { StoreProvider } = require("../../lib/provider/store");
const { BusinessRulesProvider } = require("../../index");
const { QueueProvider } = require("../../index");

const { Constants } = require("../../lib/classes/util/constants");
const ApiService = require("moleculer-web");
const { GatewayMixin}  = require("../../index");
const { Authorized }  = require("../../index");
const { CassandraDB } = require("./db");
const request = require("supertest");
const _ = require("../../lib/modules/util/lodash");
const { v4: uuid } = require("uuid");
const { init } = require("secrets.js-grempe");
const util = require("util");

const Gateway = {
    name: "gateway",
    mixins: [ApiService, GatewayMixin],
    settings: {
        routes: [{
            path: "/",
            bodyParsers: {
                json: true
            },
            authorization: true
        },
        {
            path: "/v1/users/me",
            authorization: true,
            aliases: {
                "GET /": "v1.users.get"
            }
        },
        {
            path: "/v1/users/registerPWA",
            authorization: false,
            aliases: {
                "POST /": "v1.users.registerPWA"
            }
        },
        {
            path: "/v1/users/logInPWA",
            authorization: false,
            aliases: {
                "POST /": "v1.users.logInPWA"
            }
        },
        {
            path: "/vault/init",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.init"
            }
        },
        {
            path: "/vault/getToken",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.getToken"
            }
        },
        {
            path: "/vault/verify",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.verify"
            }
        },
        {
            path: "/vault/getSealed",
            bodyParsers: {
                json: true
            },
            authorization: false,
            aliases: {
                "POST /": "v1.vault.getSealed"
            }
        },
        {
            path: "/vault/unseal",
            bodyParsers: {
                json: true
            },
            authorization: false ,
            aliases: {
                "POST /": "v1.vault.unseal"
            }
        },
        {
            path: "/v1/store/objects",
            bodyParsers: {
                json: false
            },
            aliases: {
                // File upload from HTML form
                "POST /": "multipart:v1.store.putObject",
                // File upload from AJAX or cURL
                "PUT /:objectName": "stream:v1.store.putObject",
                "GET /:objectName": "v1.store.getObject",
                "GET /stat/:objectName": "v1.store.statObject",
                "DELETE /:objectName": "v1.store.removeObject"
            },
            authorization: true,
            //onBeforeCall(ctx, route, req, res) {
            onBeforeCall(ctx, route, req) {
                _.set(ctx, "meta.filename",_.get(req,"$params.objectName",req.headers["x-imicros-filename"]));
                _.set(ctx, "meta.mimetype",req.headers["x-imicros-mimetype"]);
            }
        }],
        services: {
            users: "v1.users",
            agents: "v1.agents",
            groups: "v1.groups"
        }
    }
}

const settings = {
    repository:{
        snapshotCounter: 2  // new snapshot after 2 new events
    },
    vault: {
        service: "v1.vault"
    }
};

const timestamp = Date.now();
const Vault = { 
    name: "vault",
    version: "v1",
    mixins: [VaultHelper],
    settings: {
        masterKey : "my very secret master key",
        /*
        db: {
            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
            keyspace: process.env.CASSANDRA_KEYSPACE || "imicros_keys" ,
            hashTable: "hashes_test_" + timestamp
        },
        */
        service: {
            unsealed: "unsealed",
        },
        expirationDays: 20
    }
};

const Keys = {
    name: "keys",
    version: "v1",
    mixins: [KeysService],
    settings
};

const admin = {
    email: `admin${timestamp.valueOf()}@imicros.de`,
    password: "ANRC4ZtNmYmpwhzCVAeuRRTX",
    locale: "deDE"
}

const Users = {
    name: "users",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [UsersBasic, CassandraDB, Publisher, Encryption, Serializer, KeysProvider, VaultProvider], 
    // dependencies: ["unsealed"],
    settings
}

const Agents = {
    name: "agents",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [AgentsBasic, CassandraDB, Publisher, Encryption, Serializer, KeysProvider, VaultProvider], 
    // dependencies: ["unsealed"],
    settings
}

const Groups = {
    name: "groups",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [GroupsBasic, CassandraDB, Publisher, Encryption, Serializer, KeysProvider, VaultProvider], 
    // dependencies: ["unsealed"],
    settings
}

const Admin = {
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [AdminBasic, CassandraDB, Publisher, Encryption, Serializer, KeysProvider, VaultProvider],
    dependencies: ["unsealed"],
    settings: {
        uniqueKey: `authm${timestamp.valueOf()}.admin.group`,
        email: admin.email,
        initialPassword: admin.password,
        locale: admin.locale,
        keys: settings.keys,
        repository:settings.repository,
        vault: settings.vault
    }
}

const Store = {
    name: "store",
    version: "v1",
    mixins: [StoreBasic, GroupsProvider, VaultProvider],
    settings: {
        services: {
            groups: "v1.groups"
        }
    }
}

const Flow = {
    name: "flow",
    version: "v1",
    mixins: [FlowBasic,BusinessRulesProvider,StoreProvider,QueueProvider,GroupsProvider,VaultProvider],
    dependencies: ["v1.groups"],
    settings: {
        db: {
            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
            keyspace: process.env.CASSANDRA_KEYSPACE_FLOW || "imicros_flow"
        }
    }
}

const BusinessRules = {
    name: "businessRules",
    version: "v1",
    mixins: [BusinessRulesBasic,StoreProvider,GroupsProvider,VaultProvider],
    dependencies: ["v1.groups"],
    settings: {
        db: {
            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
            keyspace: process.env.CASSANDRA_KEYSPACE_DECISION || "imicros_decision"
        }
    }
}

const Templates = {
    name: "templates",
    version: "v1",
    mixins: [TemplateBasic, StoreProvider]
}

const Smtp = {
    name: "smtp",
    version: "v1",
    mixins: [SmtpBasic, GroupsProvider, StoreProvider, VaultProvider]
}

const kafka = process.env.KAFKA_BROKER || "localhost:9092";
const Queue = { 
    name: "queue",
    version: "v1",
    mixins: [QueueBasic, Serializer],
    settings: {
        brokers: [kafka],
        allowAutoTopicCreation: true
    }
}
const EventQueueWorker = { 
    name: "eventQueueWorker",
    version: null,
    mixins: [WorkerService, Serializer],
    settings: {
        brokers: [kafka],
        allowAutoTopicCreation: true,
        topic: Constants.QUEUE_TOPIC_EVENTS,
        fromBeginning: false,
        handler: [
            { event: "event.raised", handler: "v1.flow.assignEvent" },
            { event: "instance.requested", handler: "v1.flow.createInstance" }
        ]
    }
}
const InstanceQueueWorker = { 
    name: "instanceQueueWorker",
    version: null,
    mixins: [WorkerService, Serializer],
    settings: {
        brokers: [kafka],
        allowAutoTopicCreation: true,
        topic: Constants.QUEUE_TOPIC_INSTANCE,
        fromBeginning: false,
        handler: [
            { event: "event.raised", handler: "v1.flow.processEvent" },
            { event: "instance.processed", handler: "v1.flow.continueInstance" },
            { event: "job.created", handler: "v1.flow.processJob" },
            { event: "job.completed", handler: "v1.flow.processCommitJob" },
            { event: "instance.completed", handler: "v1.flow.completeInstance"}
        ]
    }
}

//const brokers = [];
/*
async function unseal () {
    brokers[0].logger.info("unseal");
    await brokers[0].waitForServices(["v1.vault"]);
    return request(server).post("/vault/init").send({
        token: process.env.MASTER_TOKEN
    }).then( async (res) => {
        const shares = res.body.shares;
        return request (server).post("/vault/getToken").send({
            share: shares[1]
        }).then( async (res) => {
            const token = res.body.token;
            return request (server).post("/vault/getSealed").send({
                token
            }).then( async (res) => {
                const sealed = res.body.sealed;
                brokers[0].logger.info("unseal sealed", sealed);
                if (sealed) {
                    await sealed.forEach( async (item) => {
                        for (let i=0; i< 3; i++) {
                            const res = await request(server).post("/vault/unseal").send({
                                nodeID: item,
                                share: shares[i]
                            });
                            brokers[0].logger.info("unseal", res.body, item, shares[i]);
                        }
                        // TODO: wait for unsealed for the current node...
                        await brokers[0].waitForServices(["unsealed"]);
                        brokers[0].logger.info("unseal finished");
                    });
                }
            });
        });
    });
}
*/

const nodes = {};

class Node {
    constructor ({ nodeID, port }) {
        this.nodeID = nodeID;
        this.port = port;
        nodes[nodeID] = this;
    }

    static getNode (nodeID) {
        return nodes[nodeID];
    }

    async setup () {
        this.initConsole();  
        const broker = new ServiceBroker({ 
            nodeID: this.nodeID || "node-1",
            logger: true,
            transporter: process.env.NATS_TRANSPORTER || "nats://localhost:4222",
            logLevel: "info",
            // middlewares: [Authorized({ service: "v1.groups"})]
            middlewares: [Authorized()]
        });
        Gateway.settings.port = this.port || 3000;
        const gateway = broker.createService(Gateway);
        this.server = gateway.server;
        broker.createService(Vault);
        broker.createService(Keys);
        broker.createService(Users);
        broker.createService(Agents);
        broker.createService(Groups);
        broker.createService(Admin);
        broker.createService(Store);
        broker.createService(Flow);
        broker.createService(BusinessRules);
        broker.createService(Templates);
        broker.createService(Smtp);
        broker.createService(Queue);
        broker.createService(EventQueueWorker);
        broker.createService(InstanceQueueWorker);
        broker.start();
        await broker.waitForServices(["gateway","v1.vault","v1.keys"]);
        // brokers.push(broker);
        broker.logger.info("setup finished");
        await broker.waitForServices(["v1.users","v1.groups","admin","unsealed", "v1.store", "v1.flow", "v1.businessRules", "v1.templates", "v1.smtp", "v1.queue", "eventQueueWorker", "instanceQueueWorker"]);
        this.broker = broker;   
        //console.log(util.inspect(broker.getLocalNodeInfo(), { showHidden: false, depth: null, colors: true }));
        this.resetConsole();        
        return this;
    }    

    getServer () {
        return this.server;
    }

    getBroker () {  
        return this.broker;
    }

    getAdmin() {
        return admin;
    }

    async stop () {
        this.initConsole();        
        await this.broker.stop();
        this.resetConsole();        
    }
    
    async getAdminGroupAccess () {
        this.initConsole();        
        let res = await request(this.server).post("/v1/users/logInPWA").send({
            sessionId : uuid(),
            email: admin.email,
            password: admin.password,
            locale: admin.locale
        });
        const authData = res.body;
        res = await request(this.server).get("/v1/users/get").set("Authorization","Bearer "+authData.authToken).send({});
        const userData = res.body;
        const adminGroupId = Object.values(userData.groups)[0].groupId;
        res = await request(this.server).post("/v1/groups/requestAccessForMember").set("Authorization","Bearer "+authData.authToken).send({ groupId: adminGroupId });
        const accessDataAdminGroup = res.body;
        accessDataAdminGroup.groupId = adminGroupId;
        accessDataAdminGroup.admin = admin;
        //res = await request(server).post("/v1/groups/get").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ groupId: adminGroupId });
        this.resetConsole(); 
        return accessDataAdminGroup;
    }

    initConsole() {
        this.console = global.console;
        if (process.env.LOG === "console") global.console = require('console');        
    }

    resetConsole() {
        if (process.env.LOG === "console") global.console = this.console;        
    }

}

//module.exports = { setup, unseal, teardown, admin, getServer, getAdminGroupAccess, Node };
module.exports = { Node };
