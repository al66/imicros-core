"use strict";

const { setup, unseal, teardown, admin, getServer } = require("../helper/node");
const { v4: uuid } = require("uuid");
const request = require("supertest");

const { setToken } = require("../helper/shared");

jest.setTimeout(50000);

describe("Test admin user", () => {

    let broker, server;

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

    it("it should init a node and create an admin user", async () => {
        expect(broker).toBeDefined();
    });

    it("should login the admin, retrieve the admin group and gat access to the admin group", async () => {
        let res = await request(server).post("/v1/users/logInPWA").send({
            sessionId : uuid(),
            email: admin.email,
            password: admin.password,
            locale: admin.locale
        });
        expect(res.statusCode).toBe(200);
        const authData = res.body;
        res = await request(server).get("/v1/users/get").set("Authorization","Bearer "+authData.authToken).send({});
        expect(res.statusCode).toBe(200);
        const userData = res.body;
        // console.log(userData);
        res = await request(server).post("/v1/groups/requestAccessForMember").set("Authorization","Bearer "+authData.authToken).send({ groupId: Object.values(userData.groups)[0].groupId });
        expect(res.statusCode).toBe(200);
        const accessDataAdminGroup = res.body;
        console.log(global);
        global.shared.setToken("accessDataAdminGroup", accessDataAdminGroup);
        res = await request(server).post("/v1/groups/get").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ groupId: Object.values(userData.groups)[0].groupId });
        expect(res.statusCode).toBe(200);
        res = await request(server).post("/v1/groups/encrypt").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ data: { any: "object" } });
        expect(res.statusCode).toBe(200);
        const encryptedData = res.body;
        res = await request(server).post("/v1/groups/decrypt").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ encrypted: encryptedData });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ any: "object" });
        // console.log(encryptedData);
        /*
        const requests = [];
        const count = 200;
        for (let i=0; i<count; i++)  {
            res = request(server).post("/v1/groups/decrypt").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ encrypted: encryptedData });
            requests.push(res);
        }
        let success = 0
        let feiled = 0;
        await Promise.all(requests).then((results) => {
            for (const res of results) {
                if (res.statusCode === 200) success++;
                else feiled++;
            }
        });
        console.log("success: ",success,"feiled: ",feiled);
        expect(success).toBe(count);
        */
    });

});
