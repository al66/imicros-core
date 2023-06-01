"use strict";

const { ServiceBroker } = require("moleculer");
const { MapService } = require("../../../index");

// helper & mocks
const { StoreMixin, put } = require("../../mocks/store.mixin");

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
            service = await broker.createService(Object.assign(MapService, { 
                name: "jsonMap",
                mixins: [StoreMixin()]
            }));
            await broker.start();
            expect(service).toBeDefined();
        });

    });
    
    describe("Test map", () => {

        let opts = {};
        
        beforeEach(() => {});

        it("it should render a simple map from object", async () => {
            let params = {
                name: "path/to/template/hello.map",
                data:  {
                    a: "key A",
                    value: "B"
                }
            };
            put("path/to/template/hello.map","{ a: value }");
            // let internal = Buffer.from(opts.meta.acl.ownerId + "~" + params.name).toString("base64");
            // globalStore[internal] =  "{ a: value }";

            return broker.call("jsonMap.map", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "key A": "B"
                });
            });
                
        });
        
        it("it should render a simple map from parameter", async () => {
            let params = {
                template: "{ a: value }",
                data:  {
                    a: "key A",
                    value: "B"
                }
            };
            return broker.call("jsonMap.map", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "key A": "B"
                });
            });
                
        });
        
        it("it should render complex map from object", async () => {
            let params = {
                name: "path/to/template/hello.map",
                data:  {
                    a: "key A",
                    b: "B",
                    keys: {
                        c: "key C",
                        d: "D"
                    }
                }
            };
            put("path/to/template/hello.map","{ a: 1, 'key ' & b: 'String', keys.c: [1,2,3,4], 'key ' & keys.d: ['1','2','3','4'] }");
            // let internal = Buffer.from(opts.meta.acl.ownerId + "~" + params.name).toString("base64");
            // globalStore[internal] =  "{ a: 1, 'key ' & b: 'String', keys.c: [1,2,3,4], 'key ' & keys.d: ['1','2','3','4'] }";

            return broker.call("jsonMap.map", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "key A": 1,
                    "key B": "String",
                    "key C": [1,2,3,4],
                    "key D": ["1","2","3","4"]
                });
            });
                
        });

        it("it should render a complex map from parameter", async () => {
            let params = {
                template: `{
                    a: x,
                    "deep": {
                        "b": sub.y
                    }
                }`,
                data:  {
                    "a": "Key A",
                    "x": "value x",
                    "sub": {
                        "y": "value y"
                    }
                }
            };
            return broker.call("jsonMap.map", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    "Key A": "value x",
                    deep: {
                        "b": "value y"
                    }
                });
            });
                
        });
        
        it("it should create a uuid", async () => {
            let params = {
                template: `{ 'id': $uuid() }`,
                data:  {}
            };
            return broker.call("jsonMap.map", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.id).toBeDefined();
                expect(res.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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