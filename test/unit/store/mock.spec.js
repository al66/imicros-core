"use strict";

const { ServiceBroker } = require("moleculer");
const { StoreServiceMock, put, get } = require("../../mocks/store");

// helper & mocks
const { groups } = require("../../helper/shared");
const fs = require("fs");
const { Readable } = require("stream");

describe("Test store service", () => {

    let broker, service;

    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                // middlewares: [middleware],
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(StoreServiceMock);
            await broker.start();
            expect(broker).toBeDefined();
        });

    });

    describe("Test makeBucket", () => {

        it("it should create a bucket for 1. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {};
            return broker.call("v1.store.makeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[0].uid);
            });
            
        });

        it("it should create a bucket for 2. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[1].uid } } };
            let params = {};
            return broker.call("v1.store.makeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[1].uid);
            });
        });

    });

    describe("Test object functions", () => {

        const collectionCount = 100;

        it("it should put an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let fstream = fs.createReadStream("assets/imicros.png");
            opts.meta.store = {
                objectName: "imicros.png"      
            };
            return broker.call("v1.store.putObject", fstream, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.png");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should put 5 additional objects", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            for (let i=0; i<2; i++) {
                let fstream = fs.createReadStream("assets/imicros.png");
                opts.meta.store = {
                    objectName: "imicros_"+i+".png"      
                };
                await broker.call("v1.store.putObject", fstream, opts).then(res => {
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
            
            let stream = await broker.call("v1.store.getObject", params, opts);
            await receive(stream);
            const orgBuf = fs.readFileSync("assets/imicros.png");
            const restoredBuf = fs.readFileSync("assets/imicros.restored.png");
            expect(orgBuf).toEqual(restoredBuf);
        });

        /*
        it("it should get meta data of an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "imicros.png"      
            };
            return broker.call("v1.store.statObject", params, opts).then(res => {
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
            return broker.call("v1.store.listObjectsArray", params, opts).then(res => {
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
            let stream = await broker.call("v1.store.listObjects", params, opts);
            let res = await receive(stream);
            expect(res).toBeDefined();
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros.png" })]));
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros_1.png" })]));
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: "imicros_4.png" })]));
        });
        */
        
        it("it should remove an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "imicros.png"      
            };
            return broker.call("v1.store.removeObject", params, opts).then(res => {
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
            return broker.call("v1.store.removeObjects", params, opts).then(res => {
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
            return broker.call("v1.store.put", params, opts).then(async res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual(params.objectName);
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
                const stored = await get(groups[0].uid, params.objectName);
                expect(stored).toEqual(params.value);
            });
            
        });

        it("it should get back a string object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object"
            };
            return broker.call("v1.store.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual("this is a test");
            });
        });

        it("it should put an string as stream", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let stream = Readable.from("this is a stream test");
            opts.meta.store = {
                objectName: "stream test"      
            };
            return broker.call("v1.store.putObject", stream, opts).then(async res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("stream test");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
                const stored = await get(groups[0].uid, opts.meta.store.objectName);
                expect(stored).toEqual("this is a stream test");
            });
            
        });

        it("it should put an object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object",
                value: { a: {b:3,c:4}}      
            };
            return broker.call("v1.store.put", params, opts).then(async res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual(params.objectName);
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
                const stored = await get(groups[0].uid, params.objectName);
                expect(stored).toEqual(params.value);
            });
            
        });

        it("it should get back a object as type object", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object"
            };
            return broker.call("v1.store.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({ a: { b:3, c:4 } });
            });
        });

        it("it should get back a object as type object", () => {
            put(groups[0].uid,"test object 2", { a: { b:3, c:4 } });
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object 2"
            };
            return broker.call("v1.store.get", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({ a: { b:3, c:4 } });
            });
        });

        /*
        it("it should put an collection of objects and get back the collection", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let calls = [];
            // console.log("put collection objects");
            console.time("put collection");
            for (let i=0; i<collectionCount; i++) {
                let params = {
                    objectName: "collection/collection object" + i,
                    value: { 
                        costcenter: "cc" + i,
                        owner: "owner" + i,
                    }      
                };
                calls.push(broker.call("v1.store.put", params, opts));
            }
            await Promise.all(calls);
            console.timeEnd("put collection");
            // console.log("get collection objects");
            console.time("get collection");
            let params = {
                path: "collection/"
            };
            return broker.call("v1.store.getCollection", params, opts).then(res => {
                console.timeEnd("get collection");
                expect(res).toBeDefined();
                for (let i=0; i<collectionCount; i++) {
                    expect(res["collection/collection object" + i]).toEqual({ costcenter: "cc" +i , owner: "owner"+i });
                }
                // console.log(res);
            });
        });
        */

        it("it should put a boolean", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectName: "test object",
                value:true      
            };
            return broker.call("v1.store.put", params, opts).then(res => {
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
            return broker.call("v1.store.get", params, opts).then(res => {
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
            return broker.call("v1.store.put", params, opts).then(res => {
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
            return broker.call("v1.store.get", params, opts).then(res => {
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
            return broker.call("v1.store.removeObjects", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
            
        });

        it("it should remove the collection objects", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
                objectsList: []      
            };
            for (let i=0; i<collectionCount; i++) {
                params.objectsList.push("collection/collection object" + i);
            }
            return broker.call("v1.store.removeObjects", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(true);
            });
            
        });

        
    });

    describe("Test admin", () => {
    
        /*
        it("it should list all buckets", async () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {
            };
            let res = await broker.call("v1.store.listBuckets", params, opts);
            expect(res).toBeDefined();
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: groups[0].uid })]));
            expect(res).toEqual(expect.arrayContaining([expect.objectContaining({ name: groups[1].uid })]));
        });
        */
        
    });
        

    describe("Test removeBucket", () => {

        it("it should remove bucket for 1. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[0].uid } } };
            let params = {};
            return broker.call("v1.store.removeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(groups[0].uid);
            });
            
        });
        
        it("it should remove bucket for 2. owner", () => {
            let opts = { meta: { acl: { ownerId: groups[1].uid } } };
            let params = {};
            return broker.call("v1.store.removeBucket", params, opts).then(res => {
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