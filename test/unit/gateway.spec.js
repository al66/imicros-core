
const { ServiceBroker } = require("moleculer");
const ApiService = require("moleculer-web");
const { Constants } = require("../../lib/util/constants");
const GatewayMixin = require("../../lib/mixins/gateway");
const request = require("supertest");
const jwt 	= require("jsonwebtoken");
const { v4: uuid } = require("uuid");

const Gateway = {
    name: "gateway",
    mixins: [ApiService, GatewayMixin],
    settings: {
        routes: [{
            path: "/api",
            bodyParsers: {
                json: true
            },
            authorization: true,
            aliases: {
                "POST /": "gateway.test"
            }
        }],
        services: {
            users: "v1.users",
            agents: "v1.agents",
            groups: "v1.groups"
        }
    },
    actions: {
        test: {
            async handler(ctx) {
                return {
                    action: "test",
                    params: ctx.params,
                    meta: ctx.meta
                };
            }
        }
    }
}

const data = {
    userId: uuid(), 
    agentId: uuid(),
    groupId: uuid(),
    sessionId: uuid() 
}
const authTokenUsers = jwt.sign({
    type: Constants.TOKEN_TYPE_AUTH,
    userId: data.userId, 
    sessionId: data.sessionId 
}, "my secret" ,{});
const accessTokenUsers = jwt.sign({
    type: Constants.TOKEN_TYPE_GROUP_ACCESS,
    groupId: data.groupId,
    userId: data.userId, 
    sessionId: data.sessionId 
}, "my secret" ,{});
const accessTokenInternalUsers = jwt.sign({
    type: Constants.TOKEN_TYPE_INTERNAL_ACCESS,
    groupId: data.groupId,
    userId: data.userId,
    sessionId: data.sessionId 
}, "my secret" ,{});
const userToken = jwt.sign({
    type: Constants.TOKEN_TYPE_USER,
    userId: data.userId, 
    sessionId: data.sessionId,
    user: {
        uuid: data.userId
    }
}, "my secret" ,{});
const authTokenAgents = jwt.sign({
    type: Constants.TOKEN_TYPE_AUTH,
    agentId: data.agentId, 
    sessionId: data.sessionId 
}, "my secret" ,{});
const accessTokenAgents = jwt.sign({
    type: Constants.TOKEN_TYPE_GROUP_ACCESS,
    groupId: data.groupId,
    agentId: data.agentId, 
    sessionId: data.sessionId 
}, "my secret" ,{});
const accessTokenInternalAgents = jwt.sign({
    type: Constants.TOKEN_TYPE_INTERNAL_ACCESS,
    groupId: data.groupId,
    agentId: data.agentId, 
    sessionId: data.sessionId 
}, "my secret" ,{});
const agentToken = jwt.sign({
    type: Constants.TOKEN_TYPE_USER,
    agentId: data.agentId, 
    sessionId: data.sessionId,
    agent: {
        uuid: data.agentId
    }
}, "my secret" ,{});

const Users = {
    name: "users",
    version: 1,
    actions: {
        verifyAuthToken: {
            visibility: "public",
            async handler(ctx) {
                if (ctx.meta.authToken === authTokenUsers) return userToken;
                if (ctx.meta.authToken === accessTokenUsers) return userToken;
                throw new Error("Unauthorized");
            }
        }
    }
}

const Agents = {
    name: "agents",
    version: 1,
    actions: {
        verifyAuthToken: {
            visibility: "public",
            async handler(ctx) {
                if (ctx.meta.authToken === authTokenAgents) return agentToken;
                if (ctx.meta.authToken === accessTokenAgents) return agentToken;
                throw new Error("Unauthorized");
            }
        }
    }
}

const Groups = {
    name: "groups",
    version: 1,
    actions: {
        verifyAccessToken: {
            visibility: "public",
            async handler(ctx) {
                if (ctx.meta.authToken === accessTokenUsers) return accessTokenInternalUsers;
                if (ctx.meta.authToken === accessTokenAgents) return accessTokenInternalAgents;
                throw new Error("Unauthorized");
            }
        }
    }
}

describe("Test 'gateway' service", () => {

    let broker, server;

    it("should start gateway service", async () => {
        broker = new ServiceBroker({ 
            logger: true,
            logLevel: "info"
        });
        const service = broker.createService(Gateway);
        broker.createService(Users);
        broker.createService(Agents);
        broker.createService(Groups);
        await broker.start();
        server = service.server;
        expect(service).toBeDefined();
        expect(server).toBeDefined();
        expect(service.name).toEqual("gateway");
    });

    it("should return 401 with unvalid token", async () => {
        const params = {};
        return request(server)
        .post("/api")
        .set("Authorization","Bearer "+"UNVALID")
        .send(params)
        .then(res => {
            expect(res.statusCode).toBe(401);
            expect(res.body).toBeDefined();
        });
    });

    it("should authorize with valid authToken for user login", async () => {
        const params = {};
        return request(server)
        .post("/api")
        .set("Authorization","Bearer "+authTokenUsers)
        .send(params)
        .then(res => {
            expect(res.statusCode).toBe(200);
            expect(res.body).toBeDefined();
            expect(res.body.params).toEqual(params);
            expect(res.body.meta.userToken).toEqual(userToken);
            expect(res.body.meta.accessToken).toBeUndefined();
        });
    });

    it("should authorize with valid accessToken for members", async () => {
        const params = {};
        return request(server)
        .post("/api")
        .set("Authorization","Bearer "+accessTokenUsers)
        .send(params)
        .then(res => {
            expect(res.statusCode).toBe(200);
            expect(res.body).toBeDefined();
            expect(res.body.params).toEqual(params);
            expect(res.body.meta.userToken).toEqual(userToken);
            expect(res.body.meta.accessToken).toEqual(accessTokenInternalUsers);
        });
    });

    it("should authorize with valid authToken for agent login", async () => {
        const params = {};
        return request(server)
        .post("/api")
        .set("Authorization","Bearer "+authTokenAgents)
        .send(params)
        .then(res => {
            expect(res.statusCode).toBe(200);
            expect(res.body).toBeDefined();
            expect(res.body.params).toEqual(params);
            expect(res.body.meta.agentToken).toEqual(agentToken);
            expect(res.body.meta.accessToken).toBeUndefined();
        });
    });

    it("should authorize with valid accessToken for agents", async () => {
        const params = {};
        return request(server)
        .post("/api")
        .set("Authorization","Bearer "+accessTokenAgents)
        .send(params)
        .then(res => {
            expect(res.statusCode).toBe(200);
            expect(res.body).toBeDefined();
            expect(res.body.params).toEqual(params);
            expect(res.body.meta.agentToken).toEqual(agentToken);
            expect(res.body.meta.accessToken).toEqual(accessTokenInternalAgents);
        });
    });

    it("should stop the broker", async () => {
        await broker.stop();
        expect(broker).toBeDefined();
    });

});