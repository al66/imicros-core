"use strict";

const { ServiceBroker } = require("moleculer");
const ApiService = require("moleculer-web");
const { Unseal } = require("../../../index");
// const crypto = require("crypto");
const jwt = require("jsonwebtoken");
// const util = require("util");

const share = 
"803627be857d5d53551e518ebacf626a3b24e4b3a48e73a92bffaf3f082aa8411047fceedc4ebc2575177d006da949cedd4d45013adce30017af7c1e6aa35287684e82ea19b8f327f21c0ac9577951618af"; // crypto.randomBytes(256).toString("hex");
const secret = "c1cd91053fca873a4cb7b2549ec1010a9a1a4c2a"; // crypto.randomBytes(40).toString("hex");
let exp = new Date();
exp.setDate(new Date().getDate() + 60);
const token = jwt.sign({ any: "data", exp: Math.floor(exp.getTime() / 1000)}, secret);
let sealed = ["NODE_A", "NODE_B"];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// mock gateway service
const GatewayService = {
    name: "gateway",
    mixins: [ApiService],
    version: 1,
    settings: {
        services: {
            vault: "vault"
        },
        routes: [
            {
                path: "/",

                bodyParsers: {
                    json: true
                },

                authorization: true
            },
            {
                path: "/vault/getToken",

                bodyParsers: {
                    json: true
                },
                
                authorization: false,

                aliases: {
                    "POST /": "v2.vault.getToken"
                }
            },
            {
                path: "/vault/verify",

                bodyParsers: {
                    json: true
                },
                
                authorization: false,

                aliases: {
                    "POST /": "v2.vault.verify"
                }
            },
            {
                path: "/vault/getSealed",

                bodyParsers: {
                    json: true
                },
                
                authorization: false,

                aliases: {
                    "POST /": "v2.vault.getSealed"
                }
            },
            {
                path: "/vault/unseal",

                bodyParsers: {
                    json: true
                },
                
                authorization: false ,
                
                aliases: {
                    "POST /": "v2.vault.unseal"
                }
            }
        ]
    }
    
};

// mock vault service
const VaultService = {
    name: "vault",
    version: 2,
    actions: {
        getToken: {
            handler(ctx) {
                if (ctx.params.share === share) return {
                    token
                };
            }
        },
        verify: {
            handler(ctx) {
                if (ctx.params.token === token) return { valid: true };
                return { valid: false };
            }
        },
        getSealed: {
            handler(ctx) {
                if (ctx.params.token === token) return {
                    sealed
                };
            }
        },
        unseal: {
            handler(ctx) {
                if (sealed.indexOf(ctx.params.nodeID) >= 0) {
                    sealed.splice(sealed.indexOf(ctx.params.nodeID), 1);
                    console.log("unseal called for node: " + ctx.params.nodeID);
                    return {
                        received: 1
                    };
                }
                throw new Error("vault is already unsealed");
            }
        }
    }
};

describe("Test unseal service", () => {

    let broker, service, gatewayService, vaultService;
    beforeAll(() => {
    });
    
    afterAll(async () => {
    });
    
    describe("Test start service", () => {


        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            gatewayService = broker.createService(GatewayService);
            vaultService = broker.createService(VaultService);
            await broker.start();
            // server = gatewayService.server;
            expect(gatewayService).toBeDefined();
            expect(vaultService).toBeDefined();
        });


        it("it should start the service", async () => {
            service = new Unseal();
            service.config({
                share,
                host: "http://localhost:3000",
                service: "vault"
            });
            expect(sealed.length).toEqual(2);
            service.start();
            expect(service).toBeDefined();
            await sleep(4000);
            expect(sealed.length).toEqual(0);
        });

    });

    describe("Test stop service", () => {
        it("should stop the service", async () => {
            expect.assertions(1);
            service.stop();
            expect(service).toBeDefined();
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

