const { ServiceBroker } = require("moleculer");
const { UsersService: UsersBasic } = require("../../index");
const { GroupsService: GroupsBasic } = require("../../index");
const { AgentsService: AgentsBasic } = require("../../index");
const { Serializer } = require("../../lib/provider/serializer");
const { Publisher } = require("../../lib/provider/publisher");
const { Keys } = require("../../lib/provider/keys");
const { Encryption } = require("../../lib/provider/encryption");
const { Vault:VaultProvider } = require("../../lib/provider/vault");
const { VaultService:VaultBasic } = require("../../index");
const { AdminService: AdminBasic } = require("../../index");
const { Constants } = require("../../lib/classes/util/constants");
const ApiService = require("moleculer-web");
const { GatewayMixin}  = require("../../index");
const { Authorized }  = require("../../index");
const { StoreService: StoreBasic }  = require("../../index");
const { CassandraDB } = require("./db");
const request = require("supertest");
const _ = require("../../lib/modules/util/lodash");

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
    keys: {
        db: {
            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
            keyspace: process.env.CASSANDRA_KEYSPACE_AUTH || "imicros_auth",
            keysTable: "authkeys"
        }
    },
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
    mixins: [VaultBasic],
    settings: {
        db: {
            contactPoints: process.env.CASSANDRA_CONTACTPOINTS || "127.0.0.1", 
            datacenter: process.env.CASSANDRA_DATACENTER || "datacenter1", 
            keyspace: process.env.CASSANDRA_KEYSPACE || "imicros_keys" ,
            hashTable: "hashes_test_" + timestamp
        },
        service: {
            unsealed: "unsealed",
        },
        expirationDays: 20
    }
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
    mixins: [UsersBasic, CassandraDB, Publisher, Encryption, Serializer, Keys, VaultProvider], 
    // dependencies: ["unsealed"],
    settings
}

const Agents = {
    name: "agents",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [AgentsBasic, CassandraDB, Publisher, Encryption, Serializer, Keys, VaultProvider], 
    // dependencies: ["unsealed"],
    settings
}

const Groups = {
    name: "groups",
    version: "v1",
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [GroupsBasic, CassandraDB, Publisher, Encryption, Serializer, Keys, VaultProvider], 
    // dependencies: ["unsealed"],
    settings
}

const Admin = {
    // sequence of providers is important: 
    // Keys and Serializer must be first, as they are used by Encryption
    // Database again depends on Encryption
    mixins: [AdminBasic, CassandraDB, Publisher, Encryption, Serializer, Keys, VaultProvider],
    dependencies: ["unsealed"],
    settings: {
        uniqueKey: `authm${timestamp.valueOf()}.admin.group`,
        email: admin.email,
        initialPassword: admin.password,
        locale: admin.locale,
        events: [
            "UserConfirmationRequested",
            "UserPasswordResetRequested",
            "UserDeletionRequested",
            "UserDeletionConfirmed",
            "GroupCreated",
            "GroupDeletionConfirmed"
        ],
        channel: "imicros.internal.events",
        adapter: "Kafka",
        keys: settings.keys,
        repository:settings.repository,
        vault: settings.vault
    }
}

const Store = {
    name: "store",
    version: "v1",
    mixins: [StoreBasic],
    settings: {
        services: {
            groups: "v1.groups"
        }
    }
}

const brokers = [];
let server;

async function setup (nodeID) {
    const broker = new ServiceBroker({ 
        nodeID: nodeID || "node-1",
        logger: true,
        transporter: process.env.NATS_TRANSPORTER || "nats://localhost:4222",
        logLevel: "info",
        middlewares: [Authorized({ service: "v1.groups"})]
    });
    const gateway = broker.createService(Gateway);
    server = gateway.server;
    broker.createService(Vault);
    broker.createService(Users);
    broker.createService(Agents);
    broker.createService(Groups);
    broker.createService(Admin);
    broker.createService(Store);
    broker.start();
    await broker.waitForServices(["gateway","v1.vault"]);
    brokers.push(broker);
    broker.logger.info("setup finished");
    return broker;
}

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

function getServer () {
    return server;
}

async function teardown () {
    for (let i=0; i<brokers.length; i++) {
        await brokers[i].stop();
    }
}

module.exports = { setup, unseal, teardown, admin, getServer };
