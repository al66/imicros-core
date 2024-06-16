"use strict";

const { Node } = require("../helper/node");
const { v4: uuid } = require("uuid");
const request = require("supertest");
require("../helper/expectExtend");
const fs = require("fs");

jest.setTimeout(50000);

describe("Test store service", () => {

    let node, server, accessDataAdminGroup;

    beforeAll(async () => {
        node = await new Node({ nodeID: "node-3", port: 3002 }).setup();
        server = node.getServer();
        accessDataAdminGroup = await node.getAdminGroupAccess();
    });

    afterAll(async () => {
        await node.stop();
    });

    it("should create a bucket", async () => {
        let res = await request(server).post("/v1/store/makeBucket").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(res.body.bucketName).toEqual(accessDataAdminGroup.groupId);
    });

    it("it should upload the attached files", () => {
        return request(server)
            .post("/v1/store/objects")
            .set("Authorization","Bearer "+accessDataAdminGroup.accessToken)
            .attach("imicros_1.png","assets/imicros.png")
            .attach("imicros_2.png","assets/imicros.png")
            .then(res => {
                expect(res.statusCode).toBe(200);
                expect(res.body).toContainObject({ bucketName: accessDataAdminGroup.groupId, objectName: "imicros_1.png" });
                expect(res.body).toContainObject({ bucketName: accessDataAdminGroup.groupId, objectName: "imicros_2.png" });
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
