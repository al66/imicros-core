"use strict";

const { Node, admin } = require("../helper/node");
const { v4: uuid } = require("uuid");
const request = require("supertest");

const { setToken } = require("../helper/shared");

jest.setTimeout(50000);

describe("Test admin user", () => {

    let node, server, accessDataAdminGroup;

    beforeAll(async () => {
        node = await new Node({ nodeID: "node-1", port: 3000 }).setup();
        server = node.getServer();
    });

    afterAll(async () => {
        await node.stop();
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
        accessDataAdminGroup = res.body;
        accessDataAdminGroup.groupId = Object.values(userData.groups)[0].groupId;
        res = await request(server).post("/v1/groups/get").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ groupId: Object.values(userData.groups)[0].groupId });
        expect(res.statusCode).toBe(200);
        res = await request(server).post("/v1/groups/encrypt").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ data: { any: "object" } });
        expect(res.statusCode).toBe(200);
        const encryptedData = res.body;
        res = await request(server).post("/v1/groups/decrypt").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ encrypted: encryptedData });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ any: "object" });
        /*
        const requests = [];
        const count = 200;  // ~ maximum on a single node with 1 core
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

    it("should create a bucket", async () => {
        let res = await request(server).post("/v1/store/makeBucket").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(res.body.bucketName).toEqual(accessDataAdminGroup.groupId);
    });


    it("it should upload the basic workflow files", () => {
        return request(server)
            .post("/v1/store/objects")
            .set("Authorization","Bearer "+accessDataAdminGroup.accessToken)
            .attach("workflow/UserConfirmationTemplates.dmn","assets/UserConfirmationTemplates.dmn")
            .attach("workflow/UserConfirmationRequested.bpmn","assets/UserConfirmationRequested.bpmn")
            .then(res => {
                expect(res.statusCode).toBe(200);
                expect(res.body).toContainObject({ bucketName: accessDataAdminGroup.groupId, objectName: "workflow/UserConfirmationTemplates.dmn" });
                expect(res.body).toContainObject({ bucketName: accessDataAdminGroup.groupId, objectName: "workflow/UserConfirmationRequested.bpmn" });
            });
    });

    it("should render a given template", async () => {
        let res = await request(server).post("/v1/templates/render").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ template: "Hello, {{ name }}!", data: { name: "my friend" } });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual("Hello, my friend!");
    });


});
