"use strict";

const { ServiceBroker } = require("moleculer");
const { TemplateService } = require("../../../index");
const { StoreProvider } = require("../../../lib/provider/store");

// helper & mocks
const { StoreServiceMock, put } = require("../../mocks/store");

const { v4: uuid } = require("uuid");

describe("Test template service", () => {

    let broker, service;
    beforeAll(() => {
    });
    
    afterAll(() => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug" // "info" //"debug"
            });
            service = await broker.createService(Object.assign(TemplateService, { 
                name: "template",
                mixins: [StoreProvider]
            }));
            // Start additional services
            [StoreServiceMock].map(service => { return broker.createService(service); }); 
            await broker.start();
            expect(service).toBeDefined();
        });

    });
    
    describe("Test render", () => {

        let opts = {}, groupId = uuid();

        beforeEach(() => {
            opts = { meta: { ownerId: groupId, acl: { ownerId: groupId } }};
        });
        
        it("it should render the template", async () => {
            let params = {
                name: "path/to/template/hello.tpl",
                data: { name: "my friend" }
            };
            put(groupId,"path/to/template/hello.tpl",{ template: "Hello, {{ name }}!" });

            return broker.call("template.render", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual("Hello, my friend!");
            });
                
        });
        
        it("it should render template with deep data structure", async () => {
            let params = {
                name: "path/to/template/hello.tpl",
                data: { name: { lastName: "my friend" } }
            };
            put(groupId,"path/to/template/hello.tpl",{ template: "Hello, {{ name.lastName }}!" });

            return broker.call("template.render", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual("Hello, my friend!");
            });
                
        });
        
        it("it should return null due to missing object", async () => {
            let params = {
                name: "path/to/template/missing.tpl",
                data: { name: "my friend" }
            };
            return broker.call("template.render", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(null);
            });
                
        });
        
        it("it should return null due to unvalid template", async () => {
            let params = {
                name: "path/to/template/unvalid.tpl",
                data: { name: "my friend" }
            };
            put(groupId,"path/to/template/unvalid.tpl",{ template: "Hello, {{ name.lastName !" }); // missing closing brackets...
          
            return broker.call("template.render", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(null);
            });
                
        });
        
        it("it should render an given template", async () => {
            let params = {
                template: "Hello, {{ name }}!",
                data: { name: "my best friend" }
            };
            return broker.call("template.render", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual("Hello, my best friend!");
            });
                
        });
        
        it("it should return null due to missing template", async () => {
            let params = {
                data: { name: "my friend" }
            };
            return broker.call("template.render", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(null);
            });
                
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