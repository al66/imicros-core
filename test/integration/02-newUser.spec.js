"use strict";

const { setup, unseal, teardown, admin, getServer } = require("../helper/node");
const { v4: uuid } = require("uuid");
const request = require("supertest");
const { users } = require("../helper/shared");
const { Constants } = require("../../lib/util/constants");

const jwt 	= require("jsonwebtoken");

jest.setTimeout(50000);

describe("Test creation new user", () => {

    let broker, server, authObject;

    beforeAll(async () => {
        broker  = await setup("node-1");
        server = getServer();
        await unseal();
        await broker.waitForServices(["v1.users","v1.groups","admin","unsealed"]);
    });

    afterAll(async () => {
        // const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        // await delay(10000) /// waiting 10 second for issuing logs.
        await teardown();
    });

    describe("Test path v1/users/registerPWA", () => {

        it("it should call v1.users.registerPWA w/o authorization check", () => {
            let params = {
                userId: users[1].uid,
                email: users[1].email,
                password: users[1].password,
                locale: users[1].locale
            };
            return request(server)
                .post("/v1/users/registerPWA")
                .send(params)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(res.body).toBeDefined();
                    expect(res.body.userId).toEqual(params.userId);
                });
        });
        
    });

    describe("Test path v1/users/logInPWA", () => {

        it("it should call v1.users.logInPWA w/o authorization check", () => {
            let params = {
                sessionId : uuid(),
                email: users[1].email,
                password: users[1].password,
            };
            return request(server)
                .post("/v1/users/logInPWA")
                .send(params)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(res.body).toBeDefined();
                    authObject = res.body;
                    expect(res.body.sessionId).toEqual(params.sessionId);
                    expect(res.body.locale).toEqual(users[1].locale);
                });
        });
        
    });

    describe("Test path v1/users/get and v1/users/me", () => {

        it("it should return status 401 - missing authorization", () => {
            return request(server)
                .get("/v1/users/get")
                .then(res => {
                    expect(res.statusCode).toBe(401);
                    expect(res.body).toBeDefined();
                    expect(res.body.name).toEqual("UnAuthorizedError");
                    expect(res.body.message).toEqual("Unauthorized");
                    expect(res.body.code).toEqual(401);
                    expect(res.body.type).toEqual("NO_TOKEN");
                });
        });

        it("it should return user", () => {
            return request(server)
                .get("/v1/users/get")
                .set("Authorization","Bearer "+authObject.authToken)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(res.body).toBeDefined();
                });
        });
        
        it("it should also return user", () => {
            return request(server)
                .get("/v1/users/me")
                .set("Authorization","Bearer "+authObject.authToken)
                .then(res => {
                    expect(res.statusCode).toBe(200);
                    expect(res.body).toBeDefined();
                });
        });
        
        it("it should return status 401 - missing authorization", () => {
            let token = "xyz";
            return request(server)
                .get("/v1/users/get")
                .set("Authorization","Bearer "+token)
                .then(res => {
                    expect(res.statusCode).toBe(401);
                    expect(res.body).toBeDefined();
                    expect(res.body.name).toEqual("UnAuthorizedError");
                    expect(res.body.message).toEqual("Unauthorized");
                    expect(res.body.code).toEqual(401);
                    expect(res.body.type).toEqual("INVALID_TOKEN");
                });
        });
        
        it("it should return status 401 - missing authorization", () => {
            let token = jwt.sign({ 
                type: Constants.TOKEN_TYPE_AUTH,
                userId: users[1].uid, 
                sessionId: authObject.sessionId 
            }, "mySecret");
            return request(server)
                .get("/v1/users/get")
                .set("Authorization","Bearer "+token)
                .then(res => {
                    expect(res.statusCode).toBe(401);
                    expect(res.body).toBeDefined();
                    expect(res.body.name).toEqual("UnAuthorizedError");
                    expect(res.body.message).toEqual("Unauthorized");
                    expect(res.body.code).toEqual(401);
                    expect(res.body.type).toEqual("INVALID_TOKEN");
                });
        });
        
    });

});