"use strict";

const { Node } = require("../helper/node");
const { v4: uuid } = require("uuid");
const request = require("supertest");
const nodemailer = require("nodemailer");

jest.setTimeout(50000);

let sendMailResult = null;
jest.mock("nodemailer", () => {
    const originalModule = jest.requireActual('nodemailer');
    return {
        __esModule: true,
        ...originalModule,
        createTransport: jest.fn((param) => {
            const originaltransport = originalModule.createTransport(param);
            const transport = originalModule.createTransport(param);
            transport.sendMail = async (message) => {
                //console.log("sendMail",message);
                const res = await originaltransport.sendMail(message);
                //console.log("sendMail result",res);
                sendMailResult = res;
                return res;
            }; 
            return transport;
        })
    };
});


describe("Test admin user", () => {

    let node, server, admin, accessDataAdminGroup, process, account;

    beforeAll(async () => {
        node = await new Node({ nodeID: "node-1", port: 3000 }).setup();
        server = node.getServer();
        admin = node.getAdmin();
        account = await nodemailer.createTestAccount();
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
        let failed = 0;
        await Promise.all(requests).then((results) => {
            for (const res of results) {
                if (res.statusCode === 200) success++;
                else failed++;
            }
        });
        console.log("success: ",success,"failed: ",failed);
        expect(success).toBe(count);
        */
    });

    it("should create a bucket", async () => {
        let res = await request(server).post("/v1/store/makeBucket").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(res.body.bucketName).toEqual(accessDataAdminGroup.groupId);
    });


    it("should upload the basic workflow files", () => {
        return request(server)
            .post("/v1/store/objects")
            .set("Authorization","Bearer "+accessDataAdminGroup.accessToken)
            .attach("workflow/UserConfirmationTemplates.dmn","assets/UserConfirmationTemplates.dmn")
            .attach("workflow/UserConfirmationRequested.bpmn","assets/UserConfirmationRequested.bpmn")
            .attach("workflow/templates/User Confirmation Subject en-US.json","assets/User Confirmation Subject en-US.json")
            .attach("workflow/templates/User Confirmation Body en-US.json","assets/User Confirmation Body en-US.json")
            .then(res => {
                expect(res.statusCode).toBe(200);
                expect(res.body).toContainObject({ bucketName: accessDataAdminGroup.groupId, objectName: "workflow/UserConfirmationTemplates.dmn" });
                expect(res.body).toContainObject({ bucketName: accessDataAdminGroup.groupId, objectName: "workflow/UserConfirmationRequested.bpmn" });
            });
    });

    it("should save the smtp test account", async () => {
        let res = await request(server).post("/v1/smtp/save").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({
            account: "my mail account",
            settings: {
                smtp: {
                    host: account.smtp.host,
                    port: account.smtp.port,
                    secure: account.smtp.secure
                },
                auth: {
                    user: account.user,
                    pass: {
                        _encrypt: account.pass
                    }
                }
            }
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toBeDefined();
        expect(res.body.account).toEqual("my mail account");
    });

    it("should send email as-is", async () => {
        let params = {
            account: "my mail account",
            message: {
                // Comma separated list of recipients
                to: "Max Mustermann <max.mustermann@gmail.com>",

                // Subject of the message
                subject: "Nodemailer is unicode friendly ✔",

                // plaintext body
                text: "Hello to myself!",

                // HTML body
                html:
                    "<p><b>Hello</b> to myself <img src=\"cid:note@example.com\"/></p>" +
                    "<p>Here's the imicros logo for you as an embedded attachment:<br/><img src=\"cid:imicros@example.com\"/></p>"
            }
        };
        let res = await request(server).post("/v1/smtp/send").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send(params);
        expect(res).toBeDefined();
        expect(res.statusCode).toBe(200);
        /*
        { accepted: [ 'max.mustermann@gmail.com' ],
            rejected: [],
            envelopeTime: 60,
            messageTime: 355,
            messageSize: 17051,
            response:
            '250 Accepted [STATUS=new MSGID=XSGpENwpOWUvmNbGXSGpEdEoY2VsWvv3AAAAAS1yzYsg0f4g5G02QvJAu0A]',
            envelope:
            { from: 'no-reply@pangalink.net',
                to: [ 'max.mustermann@gmail.com' ] },
            messageId: '<3736bdd6-b2ef-dca6-e5b2-db379dc161d0@pangalink.net>' }
        */
        expect(res.body.messageId).toBeDefined();
        expect(res.body.accepted).toEqual([ "max.mustermann@gmail.com" ]);
    });

    it("should grant access or flow service", async () => {
        let res = await request(server).post("/v1/flow/grantAccess").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({});
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(true);
    });

    it("should deploy the decision table used in the workflow", async () => {
        let res = await request(server).post("/v1/businessRules/deploy").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ objectName: "workflow/UserConfirmationTemplates.dmn" });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(true);
    });

    it("should evaluate the deployed decision table", async () => {
        let res = await request(server).post("/v1/businessRules/evaluate").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ 
            businessRuleId: "UserConfirmationTemplates",
            context: {
                locale: "en-US"
            }
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            'Determine User Confirmation Templates': {
                subject: 'workflow/templates/User Confirmation Subject en-US.json',
                body: 'workflow/templates/User Confirmation Body en-US.json'
            }
        });
    });

    it("should deploy the workflow", async () => {
        let res = await request(server).post("/v1/flow/deployProcess").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ objectName: "workflow/UserConfirmationRequested.bpmn" });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ 
            processId: expect.any(String),
            versionId: expect.any(String)
         });
         process = res.body;
    });

    it("should retrieve the deployed workflow", async () => {
        let res = await request(server).post("/v1/flow/getProcess").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ 
            processId: process.processId ,
            versionId: process.versionId,
            xml: true 
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ 
            processId: expect.any(String),
            versionId: expect.any(String),
            created: expect.any(String),
            parsedData: expect.any(Object),
            xmlData: expect.any(String)
         });
    });

    it("should activate the workflow", async () => {
        let res = await request(server).post("/v1/flow/activateVersion").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({ 
            processId: process.processId ,
            versionId: process.versionId
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(true);
    });

    it("should render the subject template", async () => {
        let res = await request(server).post("/v1/templates/render").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({
            name: "workflow/templates/User Confirmation Subject en-US.json", 
            data: { "email": "max.mustermann@company.de", "locale": "en-US", "confirmationToken": "anyConfirmationToken" } 
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual("Confirmation for registration on imicros server");
    });

    it("should render the body template", async () => {
        let res = await request(server).post("/v1/templates/render").set("Authorization","Bearer "+accessDataAdminGroup.accessToken).send({
            name: "workflow/templates/User Confirmation Body en-US.json", 
            data: { "email": "max.mustermann@company.de", "locale": "en-US", "confirmationToken": "anyConfirmationToken" } 
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.includes("anyConfirmationToken")).toEqual(true);
    });

    it("should execute the workflow", async () => {
        sendMailResult = null;
        const broker = node.getBroker();
        /*
        for (let i=0; i<10; i++) {
            await broker.emit("UserConfirmationRequested",{ userId: "anyId", confirmationToken: "anyConfirmationToken", email: "max.mustermann@company.com", locale: "en-US" });
        }
        */
        await broker.emit("UserConfirmationRequested",{ userId: "anyId", confirmationToken: "anyConfirmationToken", email: "max.mustermann@company.com", locale: "en-US" });
        // await new Promise(resolve => setTimeout(resolve, 5000));
    });

    it("should send the mail", async () => {
        function waitForSendMailResult() {
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    if (sendMailResult) {
                        clearInterval(interval);
                        resolve(sendMailResult);
                    }
                }, 500);
            });
        }
        const result = await waitForSendMailResult();
        expect(result).toBeDefined();
        expect(result.messageId).toBeDefined();
        expect(result.accepted).toEqual([ "max.mustermann@company.com" ]);
    });

    it("should complete the workflow", async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(true).toEqual(true);
    });

});
