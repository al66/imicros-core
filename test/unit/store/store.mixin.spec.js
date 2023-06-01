"use strict";

const { ServiceBroker } = require("moleculer");
const { StoreService } = require("../../../index");
const { StoreMixin } = require("../../../index");

// helper & mocks
const { groups } = require("../../helper/shared");
const { Groups } = require("../../mocks/groups");
const fs = require("fs");
const timestamp = Date.now();

// test service, which use the mixin
const Test = {
    actions: {
        getStream: {
            params: {
                objectName: "string"
            },
            async handler(ctx) {
                function receive(stream) {
                    let fstream;
                    if (ctx.params.objectName === "big.txt") {
                        fstream = fs.createWriteStream("assets/big."+ timestamp +".txt");
                    } else if (ctx.params.objectName === "imicros.piped.png") {
                        fstream = fs.createWriteStream("assets/imicros.piped."+ timestamp +".png");
                    } else {
                        fstream = fs.createWriteStream("assets/imicros."+ timestamp +".png");
                    }
                    return new Promise(resolve => {
                        stream.pipe(fstream);
                        fstream.on("close", () => { resolve(); });
                    });
                } 
                let stream = await this.getStream({ ctx: ctx, objectName: ctx.params.objectName });
                 
                await receive(stream);
                return { objectName: ctx.params.objectName };
            }
        },
        pipeStream: {
            params: {
                objectName: "string"
            },
            async handler(ctx) {
                let self = this;
                async function pipe () {
                    let fstream = fs.createReadStream("assets/imicros.png");
                    let stream = await self.pipeStream({ ctx: ctx, objectName: ctx.params.objectName });
                    /*
                    stream.on("end", () => { 
                        // wait for encryption and zip
                        setTimeout(function(){
                            Promise.resolve();
                        }, 100);
                    });
                    stream.on("error", (err) => { console.log(err); reject(err); });
                    */
                    await fstream.pipe(stream);
                }
                await pipe();
                // wait for encryption and zip
                await new Promise(resolve => setTimeout(resolve, 100));

                return { objectName: ctx.params.objectName };
            }
        },
        putStream: {
            params: {
                objectName: "string"
            },
            async handler(ctx) {
                let fstream;
                if (ctx.params.objectName === "big.txt") {
                    this.logger.info("Start upload big.txt");
                    fstream = fs.createReadStream("assets/big.txt");
                } else {
                    fstream = fs.createReadStream("assets/imicros.png");
                }
                let result = await this.putStream({ ctx: ctx, objectName: ctx.params.objectName, stream: fstream });
                if (ctx.params.objectName === "big.txt") {
                    this.logger.info("Finished upload big.txt");
                }
                return result;
            }
        },
        putString: {
            params: {
                objectName: "string",
                value: "string"
            },
            async handler(ctx) {
                let result = await this.putString({ ctx: ctx, objectName: ctx.params.objectName, value: ctx.params.value });
                return result;
            }
        },
        getString: {
            params: {
                objectName: "string"
            },
            async handler(ctx) {
                return await this.getString({ ctx: ctx, objectName: ctx.params.objectName });
            }
        },
        putObject: {
            params: {
                objectName: "string",
                value: "object"
            },
            async handler(ctx) {
                let result = await this.putObject({ ctx: ctx, objectName: ctx.params.objectName, value: ctx.params.value });
                return result;
            }
        },
        getObject: {
            params: {
                objectName: "string"
            },
            async handler(ctx) {
                return await this.getObject({ ctx: ctx, objectName: ctx.params.objectName });
            }
        },
        removeObject: {
            params: {
                objectName: "string"
            },
            async handler(ctx) {
                return await this.removeObject({ ctx: ctx, objectName: ctx.params.objectName });
            }
        }
    }
};


describe("Test mixin service", () => {

    let broker, service, test, keyService;
    beforeAll(async () => {
        function createBigFile() {
            return new Promise(resolve => {
                let file = fs.createWriteStream("assets/big.txt");

                for(let i=0; i<= 1e5; i++) {
                    file.write("Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n");
                }
                file.end();        
                resolve();
            });
        }
        await createBigFile();
    });
    
    afterAll(() => {
        try {
            fs.unlinkSync("assets/big.txt");
            fs.unlinkSync("assets/big."+ timestamp +".txt");
            fs.unlinkSync("assets/imicros."+ timestamp +".png");
            fs.unlinkSync("assets/imicros.piped."+ timestamp +".png");
            //file removed
        } catch(err) {
            console.error(err);
        }    
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "debug" // "info" //"debug"
            });
            broker.createService(Object.assign(StoreService, {
                settings: {
                    services: { 
                        groups: "v1.groups"
                    }
                }
            }));
            broker.createService(Groups);
            broker.createService(Object.assign(Test, { 
                name: "test",
                mixins: [StoreMixin({ service: "minio" })]
            }));
            await broker.start();
            expect(broker).toBeDefined();
        });

    });

    describe("Prepare test data", () => {

        let opts;
        
        beforeEach(() => {
            opts = { meta: { acl: { ownerId: groups[0].uid } } };
        });
        
        it("it should create a bucket", () => {
            let params = {};
            return broker.call("minio.makeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

    });
    
    describe("get stream", () => {

        let opts;
        
        beforeAll(() => {
            jest.setTimeout(20 * 1000); // doesn't work: https://github.com/facebook/jest/issues/11607
        });

        beforeEach(() => {
            opts = { meta: { acl: { ownerId: groups[0].uid } } };
        });
        
        it("it should put an object as piped stream", () => {
            let params = {
                objectName: "imicros.piped.png"
            };
            return broker.call("test.pipeStream", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.piped.png");
            });
            
        });

        it("it should get the piped object", async () => {
            let params = {
                objectName: "imicros.piped.png"
            };
            return broker.call("test.getStream", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.piped.png");
            });
                
        });
        
        it("it should remove the piped object", async () => {
            let params = {
                objectName: "imicros.piped.png"
            };
            return broker.call("test.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.piped.png");
            });
                
        });
        
        it("it should put an object as readable stream", () => {
            let params = {
                objectName: "imicros.png"
            };
            return broker.call("test.putStream", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.png");
            });
            
        });
        
        it("it should put a big file as readable stream", async () => {
            let params = {
                objectName: "big.txt"
            };
            let res = await broker.call("test.putStream", params, opts);
            expect(res).toBeDefined();
            expect(res.objectName).toBeDefined();
            expect(res.objectName).toEqual("big.txt");
        
        });
        
        it("it should get a stream", async () => {
            let params = {
                objectName: "imicros.png"
            };
            return broker.call("test.getStream", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
            });
                
        });

        it("it should get the big file again", async () => {
            let params = {
                objectName: "big.txt"
            };
            return broker.call("test.getStream", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
            });
                
        });

    });

    describe("get string", () => {

        let opts;
        
        beforeEach(() => {
            opts = { meta: { acl: { ownerId: groups[0].uid } } };
        });
        
        it("it should put an string", async () => {
            let params = {
                objectName: "test.txt",
                value: "This is a string!"
            };
            let res = await  broker.call("test.putString", params, opts);
            expect(res).toBeDefined();
            expect(res.objectName).toBeDefined();
            expect(res.objectName).toEqual("test.txt");
        });
        
        it("it should get a string", async () => {
            let params = {
                objectName: "test.txt"
            };
            let res = await broker.call("test.getString", params, opts);
            expect(res).toBeDefined();
            expect(res).toEqual("This is a string!");
        });

        it("it should put an string to object path", async () => {
            let params = {
                objectName: "folder/folder/test.txt",
                value: "This is a string!"
            };
            let res = await broker.call("test.putString", params, opts);
            expect(res).toBeDefined();
            expect(res.objectName).toBeDefined();
            expect(res.objectName).toEqual("folder/folder/test.txt");
        });
        
        it("it should get a string with path", async () => {
            let params = {
                objectName: "folder/folder/test.txt"
            };
            let res = await broker.call("test.getString", params, opts);
            expect(res).toBeDefined();
            expect(res).toEqual("This is a string!");
        });

        it("it should put an object", () => {
            let params = {
                objectName: "object.json",
                value: {
                    test: 1	
                }
            };
            return broker.call("test.putObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("object.json");
            });
            
        });
        
        it("it should get an object", async () => {
            let params = {
                objectName: "object.json"
            };
            return broker.call("test.getObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    test: 1	
                });
            });
                
        });

		
    });

    describe("Clean up", () => {

        let opts;
        
        beforeEach(() => {
            opts = { meta: { acl: { ownerId: groups[0].uid } } };
        });
        
        it("it should remove object", () => {
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

        it("it should remove object", () => {
            let params = {
                objectName: "imicros.piped.png"      
            };
            return broker.call("minio.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("imicros.piped.png");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should remove object", () => {
            let params = {
                objectName: "test.txt"      
            };
            return broker.call("minio.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("test.txt");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should remove object", () => {
            let params = {
                objectName: "folder/folder/test.txt"      
            };
            return broker.call("minio.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("folder/folder/test.txt");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should remove object", () => {
            let params = {
                objectName: "object.json"      
            };
            return broker.call("minio.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("object.json");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should remove object", () => {
            let params = {
                objectName: "big.txt"      
            };
            return broker.call("minio.removeObject", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.objectName).toBeDefined();
                expect(res.objectName).toEqual("big.txt");
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
            });
            
        });

        it("it should remove the bucket again", () => {
            let params = {};
            return broker.call("minio.removeBucket", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.bucketName).toBeDefined();
                expect(res.bucketName).toEqual(opts.meta.acl.ownerId);
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