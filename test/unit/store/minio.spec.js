"use strict";

const { ServiceBroker } = require("moleculer");
const { StoreService } = require("../../../index");

// helper & mocks
const { groups } = require("../../helper/shared");
const { Groups } = require("../../mocks/groups");
const fs = require("fs");

describe("Test store service", () => {

    let broker, service;

    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares: [middleware],
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(Object.assign(StoreService, {
                settings: {
                    services: { 
                        groups: "v1.groups"
                    }
                }
            }));
            broker.createService(Groups);
            await broker.start();
            expect(broker).toBeDefined();
            //expect(service).toBeDefined();
        });

    });

    describe("Test makeBucket", () => {

        it("it should create a bucket for 1. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {};
            return broker.call("minio.makeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[0].uid);
            });
            
        });

        it("it should create a bucket for 2. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[1].uid } } };
            let params = {};
            return broker.call("minio.makeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[1].uid);
            });
        });

    });

    describe("Test object functions", () => {

        it("it should put an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let fstream = fs.createReadStream("assets/imicros.png");
            opts.meta.store = {
                objectName: "imicros.png"      
            };
            return broker.call("minio.putObject", fstream, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.png");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should put 5 additional objects", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let fstream = fs.createReadStream("assets/imicros.png");
            for (let i=0; i<5; i++) {
                opts.meta.store = {
                    objectName: "imicros_"+i+".png"      
                };
                await broker.call("minio.putObject", fstream, opts).then(res => {
                    expect(res).toBeDefined();
                    expect(res.objectName).toBeDefined();
                    expect(res.objectName).toEqual("imicros_"+i+".png" );
                    expect(res.bucketName).toEqual(groups[0].uid);
                });
            }
            
        });

        it("it should get an object", async () => {
            let fstream = fs.createWriteStream("assets/imicros.restored.png");
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "imicros.png"      
            };
            function receive(stream) {
                return new Promise(resolve => {
                    stream.pipe(fstream);
                    fstream.on("close", () => {
                        resolve();
                    });
                });
            } 
            
            let stream = await broker.call("minio.getObject", params, opts);
            await receive(stream);
        });

        it("it should get meta data of an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "imicros.png"      
            };
            return broker.call("minio.statObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.size).toBeDefined();
                expect(res.lastModified).toBeDefined();
                expect(res.etag).toBeDefined();
                expect(res.metaData).toBeDefined();
            });
            
        });

        it("it should list the objects in the bucket as an array", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
            };
            return broker.call("minio.listObjectsArray", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros.png" })]));
                expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros_1.png" })]));
                expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros_4.png" })]));
            });
        });

        it("it should list the objects in the bucket as an readable stream", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
            };
            function receive(stream) {
                return new Promise((resolve, reject) => {
                    let objects = [];
                    stream.on("data", obj => objects.push(obj));
                    stream.on("end", () => resolve(objects));
                    stream.on("error", reject);
                });
            } 
            let stream = await broker.call("minio.listObjects", params, opts);
            let res = await receive(stream);
            expect(res).toBeDefined();
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros.png" })]));
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros_1.png" })]));
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros_4.png" })]));
        });
        
        it("it should remove an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "imicros.png"      
            };
            return broker.call("minio.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.png");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should remove a list of objects", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectsList: []      
            };
            for (let i=0; i<5; i++) {
                params.objectsList.push("imicros_"+i+".png");
            }
            return broker.call("minio.removeObjects", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
            
        });
       
        it("it should put a string", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object",
                value: "this is a test"      
            };
            return broker.call("minio.put", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual(params.objectName);
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should get back a string object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object"
            };
            return broker.call("minio.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual("this is a test");
            });
        });

        it("it should put an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object",
                value: { a: {b:3,c:4}}      
            };
            return broker.call("minio.put", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual(params.objectName);
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should get back a object as type object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object"
            };
            return broker.call("minio.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({ a: { b:3, c:4 } });
            });
        });

        it("it should put a boolean", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object",
                value:true      
            };
            return broker.call("minio.put", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual(params.objectName);
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should get back a object as type boolean", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object"
            };
            return broker.call("minio.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
        });

        it("it should put a number", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object",
                value:56.7     
            };
            return broker.call("minio.put", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual(params.objectName);
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should get back a object as type number", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object"
            };
            return broker.call("minio.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(56.7);
            });
        });

        it("it should remove a list of objects", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectsList: []      
            };
            params.objectsList.push("test object");
            return broker.call("minio.removeObjects", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
            
        });
        
    });

    describe("Test admin", () => {
    
        it("it should list all buckets", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
            };
            let res = await broker.call("minio.listBuckets", params, opts);
            expect(res).toBeDefined();
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: groups[0].uid })]));
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: groups[1].uid })]));
        });
        
    });
        

    describe("Test removeBucket", () => {

        it("it should remove bucket for 1. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {};
            return broker.call("minio.removeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[0].uid);
            });
            
        });
        
        it("it should remove bucket for 2. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[1].uid } } };
            let params = {};
            return broker.call("minio.removeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[1].uid);
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