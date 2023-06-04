"use strict";

const { setup, unseal, teardown, admin, getServer } = require("../helper/node");
const { v4: uuid } = require("uuid");
const request = require("supertest");
require("../helper/expectExtend");
const fs = require("fs");

jest.setTimeout(50000);

describe("Test store service", () => {

    let broker, server, authData, accessDataAdminGroup, adminGroupId;

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

    it("should login the admin, retrieve the admin group and gat access to the admin group", async () => {
        let res = await request(server).post("/v1/users/logInPWA").send({
            sessionId : uuid(),
            email: admin.email,
            password: admin.password,
            locale: admin.locale
        });
        expect(res.statusCode).toBe(200);
        authData = res.body;
        res = await request(server).get("/v1/users/get").set("Authorization","Bearer "+authData.authToken).send({});
        expect(res.statusCode).toBe(200);
        const userData = res.body;
        adminGroupId = Object.values(userData.groups)[0].groupId;
        res = await request(server).post("/v1/groups/requestAccessForMember").set("Authorization","Bearer "+authData.authToken).send({ groupId: adminGroupId });
        expect(res.statusCode).toBe(200);
        accessDataAdminGroup = res.body;
        res = await request(server).post("/v1/groups/get").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ groupId: adminGroupId });
        expect(res.statusCode).toBe(200);
    });

    it("should create a bucket", async () => {
        let res = await request(server).post("/v1/store/makeBucket").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(res.body.bucketName).toEqual(adminGroupId);
    });

    it("it should upload the attached files", () => {
        return request(server)
            .post("/v1/store/objects")
            .set("Authorization","Bearer "+accessDataAdminGroup.accessToken)
            .attach("imicros_1.png","assets/imicros.png")
            .attach("imicros_2.png","assets/imicros.png")
            .then(res => {
                expect(res.statusCode).toBe(200);
                expect(res.body).toContainObject({ bucketName: adminGroupId, objectName: "imicros_1.png" });
                expect(res.body).toContainObject({ bucketName: adminGroupId, objectName: "imicros_2.png" });
            });
    });


    it("it should call files service", async () => {
        const response = await request(server)
            .get("/v1/store/objects/imicros_2.png")
            .set("Authorization","Bearer "+accessDataAdminGroup.accessToken)
            .buffer()
            .parse((res, cb) => {
                res.setEncoding("binary");
                res.data = "";
                res.on("data", chunk => {
                    res.data += chunk;
                });
                res.on("end", () => {
                    cb(null, Buffer.from(res.data, "binary"));
                });
            });
        expect(response.statusCode).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.length).toBeGreaterThan(0);
        const original = fs.readFileSync("assets/imicros.png");
        expect(original.equals(response.body)).toEqual(true);
    });

});
