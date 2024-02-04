/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 *
 */
"use strict";

const { pipeline } = require('node:stream/promises');
const jwt = require("jsonwebtoken");

const { Readable } = require("stream");

class ReadableObjectStream extends Readable {
    constructor(obj) {
        super();
        this.buffer = Buffer.from(obj, "base64");
        this.length = this.buffer.length;
        this.sent = 0;
    }

    _read() {
        if (!this.sent || this.sent < this.length) {
            this.push(this.buffer.subarray(this.sent, this.sent + 1024));
            this.sent += 1024;
        }
        else {
            this.push(null);
        }
    }
}

const localStore = {};

// uses in memory store for testing
class store {
    constructor() {
        this.store = localStore;
    }
    bucketExists(bucketName) {
        return this.store[bucketName] ? true : false;
    }
    makeBucket(bucketName) {
        this.store[bucketName] = {};
    }
    removeBucket(bucketName) {
        delete this.store[bucketName];
    }

    set(bucketName, objectName, value) {
        if (!this.store[bucketName]) this.store[bucketName] = {};
        this.store[bucketName][objectName] = {
            type: "value",
            value
        };
    }
    get(bucketName, objectName) {
        const obj = this.store[bucketName][objectName];
        return obj.value;
    }

    putStream(bucketName, objectName, stream) {
        if (!this.store[bucketName]) this.store[bucketName] = {};
        return new Promise((resolve, reject) => {
            let chunks = [];
            stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
            stream.on("end", () => resolve(this.store[bucketName][objectName] = {
                type: "stream",
                value: Buffer.concat(chunks).toString('base64')
            }));
            stream.on("error", reject);
        })
    }

    getStream(bucketName, objectName) {
        const obj = this.store[bucketName][objectName];
        console.log("getStream", bucketName, objectName,obj);
        return obj.type === "value" ? Readable.from(obj.value) : new ReadableObjectStream(obj.value);
    }

    delete(bucketName, objectName) {
        delete this.store[bucketName][objectName];
    }
};

function streamToString (stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
}

function put(bucketName, objectName, value) {
    localStore[bucketName][objectName] = {
        type: "value",
        value
    };
}

async function get(bucketName, objectName) {
    console.log(bucketName, objectName,localStore[bucketName][objectName]);
    const obj = localStore[bucketName][objectName];
    if (obj.type === "stream") return await streamToString(new ReadableObjectStream(obj.value));
    return localStore[bucketName][objectName].value;
}

function getStore() {
    return localStore;
}

/** Actions */
// action makeBucket { region } => { bucketName, region }
// action removeBucket { } => { bucketName, region }
// action putObject { ReadableStream } => { bucketName, objectName }
// action getObject { objectName } => { ReadableStream } 
// action getCollection { path } => { ReadableStream }
// action removeObject { objectName } => { bucketName, objectName }
// action removeObjects { objectsList } => true | Error
// action statObject { objectName } => { stat }
// action listObjects { prefix, recursive, startAfter} => { ReadableStream obj }
// action listObjectsArray { prefix, recursive, startAfter} => [ obj ]
// action listBuckets { } => [ bucket ]    only for admin service

const  StoreServiceMock = {
    name: "minio",
    
    /**
     * Service settings
     */
    settings: {
        /*
        keysService: "keys",
        adminGroup: ["uid of admin group"]
        */        
    },

    /**
     * Service metadata
     */
    metadata: {},

    /**
     * Service dependencies
     */
    //dependencies: ["keys"],	

    /**
     * Actions
     */
    actions: {

        /**
         * Create bucket for the current group
         * 
         * @actions
         * @param {string} region - The region to create the bucket in. Defaults to "eu-central-1"
         * 
         * @meta
         * @param {string} acl.owner.id - object owner => bucket name
         *
         * @returns {Object} bucketName, region
         */
        makeBucket: {
            acl: {
                before: true
            },
            params: {
                region: {type: "string", optional: true}
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                let bucketName = owner;
                let region = "europe";

                try {
                    let exists = this.memoryStore.bucketExists(bucketName);
                    if (exists) throw new Error("Bucket already exsits");
                    await this.memoryStore.makeBucket(bucketName);
                    this.logger.info("Bucket created successfully", { bucketName: bucketName, region: region });
                } catch (err) {
                    return this.logger.warn("Error creating bucket.", { bucketName: bucketName, region: region, err:err.message });
                }
                ctx.emit("bucket.created", { bucketName: bucketName, region: region });
                return { bucketName: bucketName, region: region };
            }
        }, 
        
        /**
         * Remove bucket of current group
         * 
         * @actions
         * @param -
         * 
         * @meta
         * @param {string} acl.owner.id - object owner => bucket name
         *
         * @returns {object} bucketName
         */
        removeBucket: {
            acl: {
                before: true
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                let bucketName = owner;

                try {
                    let exists = await this.memoryStore.bucketExists(bucketName);
                    if (!exists) throw new Error("Bucket doesn't exsits");
                    await this.memoryStore.removeBucket(bucketName);
                    this.logger.info("Bucket removed successfully", { bucketName: bucketName });
                } catch (err) {
                    return this.logger.warn("Error removing bucket.", { bucketName: bucketName, err: err });
                }
                ctx.emit("bucket.removed", { bucketName: bucketName });
                return { bucketName: bucketName };
            }
        }, 
        
        
        /**
         * upload an object from a stream/buffer
         * 
         * @actions
         * @param {ReadableStream} params - Readable stream
         *
         * @meta
         * @param {string} store.objectName - Name of the object
         * @param {number} store.size - Size of the object (optional).
         * @param {object} store.metaData - metaData of the object (optional).
         * 
         * @returns {object} bucketName, objectName
         */
        putObject: {
            acl: {
                before: true
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                let params = {
                    bucketName: owner,
                    objectName: ctx.meta?.store?.objectName ?? ( ctx.meta?.fieldname ?? ( ctx.meta?.filename ?? "" )),
                    metaData: ctx.meta?.store?.metaData ?? {}
                };
                if (!params.objectName) {
                    this.logger.warn("missing filename", ctx.meta);
                    throw new Error("missing filename");
                }

                try {
                    await this.memoryStore.putStream(params.bucketName, params.objectName, ctx.params);
                } catch (err) {
                    this.logger.debug("Upload of object failed", { bucketName: params.bucketName, objectName: params.objectName, err: err });
                    this.logger.error("Upload of object failed", { bucketName: params.bucketName, objectName: params.objectName, err: err });
                    throw new Error(`Upload of object ${params.objectName} failed`);
                }

                ctx.emit("object.updated", { bucketName: params.bucketName, objectName: params.objectName });
                return { bucketName: params.bucketName, objectName: params.objectName };
            }
        },

        put: {
            acl: {
                before: true
            },
            params: {
                objectName: { type: "string" },
                value: [{ type: "string" },{ type: "object" },{ type: "number" },{ type: "boolean" }]
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const objectName = ctx.params.objectName;
                let value = ctx.params.value;
                if (typeof value === "number" || typeof value === "boolean" || typeof obj === "object") value = JSON.stringify(value);

                // 
                try {
                    await this.memoryStore.set(owner, objectName, value);
                    return { bucketName: owner, objectName };
                } catch (err) {
                    /* istanbul ignore next */
                    {
                        this.logger.debug(`Failed to write object ${ctx.params.objectName}`, { objectName: ctx.params.objectName });
                        throw err;
                    }
                }
            }
        },

        get: {
            acl: {
                before: true
            },
            params: {
                objectName: { type: "string" }
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                try {
                    const s =  this.memoryStore.get(owner, ctx.params.objectName);
                    console.log(s, owner, ctx.params.objectName);
                    try {
                        return JSON.parse(s);
                    } catch (e) {
                        return s;
                    }
                } catch (err) {
                    /* istanbul ignore next */
                    {
                        this.logger.debug(`Failed to retrieve object ${ctx.params.objectName}`, { objectName: ctx.params.objectName });
                        throw err;
                    }
                }
            }
        },

        /**
         * download an object as a stream
         * 
         * @actions
         * @param {string|array} objectName - name of the object, arrays are joined with / 
         * 
         * @returns {ReadableStream} Decoded payload 
         */
        getObject: {
            acl: {
                before: true
            },
            params: {
                objectName: [{ type: "string" },{ type: "array" }]
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                const objectName = Array.isArray(ctx.params.objectName) ? ctx.params.objectName.join("/") :ctx.params.objectName;
                this.logger.debug("objectName", { objectName: objectName } );
                
                const bucketName = owner;

                
                this.logger.debug("Start streaming", { bucket: bucketName, object: objectName });
                return this.memoryStore.getStream(bucketName, objectName);

            }
        },

        /**
         * download a object collection as a stream
         * 
         * @actions
         * @param {string|array} path - name of the path, arrays are joined with / 
         * 
         * @returns {ReadableStream} Decoded payload 
         */
        // TODO
        getCollection: {
            acl: {
                before: true
            },
            params: {
                path: [{ type: "string" },{ type: "array" }]
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;
                const recursive = true;
                const startAfter = "";

                function streamToString (stream) {
                    const chunks = [];
                    return new Promise((resolve, reject) => {
                        stream.on("data", chunk => chunks.push(chunk));
                        stream.on("error", reject);
                        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
                    });
                }


                const self = this;
                async function mergeObject(objectName) {
                        // create unzip stream
                        const unzip = zlib.createUnzip();

                                        // get decryption stream
                        const { decipher } = await ctx.call(`${self.services.groups}.decryptStream`);

                    self.logger.debug("Start streaming", { bucket: bucketName, object: objectName });
                    const encrypted = await self.client.getObject(bucketName, objectName);
                    return encrypted
                        .pipe(decipher)
                        .on("error", (err) => self.logger.warn("Error decrypting", { bucket: bucketName, object: objectName, err: err }))
                        .pipe(unzip)
                        .on("error", (err) => self.logger.warn("Error streaming", { bucket: bucketName, object: objectName, err: err }));
                }

                try {
                    //console.time("get collectionList");
                    const list = await new Promise((resolve, reject) => {
                        // console.log(this.client.extensions.listObjectsV2WithMetadata);
                        const stream = this.client.extensions.listObjectsV2WithMetadata(bucketName, ctx.params.path, recursive, startAfter);
                        const objects = [];
                        stream.on("data", obj => objects.push(obj));
                        stream.on("end", () => resolve(objects));
                        stream.on("error", (err) => { console.log(err); return reject });
                    });
                    //console.timeEnd("get collectionList");
                    let merged = {};
                    let tasks = [];
                    // console.log(list);
                    for (let i=0; i<list.length; i++) {
                        const objectName = list[i].name;
                        //console.log(list[i]);
                        const stream = await mergeObject(objectName);
                        const s =  await streamToString(stream);
                        try {
                            merged[objectName] = JSON.parse(s);
                        } catch (e) {
                            //console.log(e);
                            //console.log(objectName);
                            //console.log(s);
                        }
                    };
                    return merged;
                } catch (err) {
                    // console.log(err);
                    this.logger.error("listObjectsArray failed", { bucketName, prefix: ctx.params.path, recursive, startAfter });
                    throw new Error("Failed to retrieve objects list");
                }
                
                /*
                // call getObject action
                let params = {
                    objectName: ctx.params.path
                };
                try {
                    const action = `${this.version ? "v" + this.version + "." : ""}${this.name}.getObject`;
                    const stream = await ctx.call(action, params);
                    const s =  await streamToString(stream);
                    try {
                        return JSON.parse(s);
                    } catch (e) {
                        return s;
                    }
                } catch (err) {
                    
                    {
                        this.logger.debug(`Failed to retrieve object ${ctx.params.objectName}`, { objectName: ctx.params.objectName });
                        throw err;
                    }
                }
                */

            }
        },


        /**
         * remove object from bucket
         * 
         * @actions
         * @param {string} objectName - Name of the object
         *
         * @meta
         * @param {string} acl.owner.id - Id of object owner
         * 
         * @returns {object} bucketName, objectName
         */
        removeObject: {
            acl: {
                before: true
            },
            params: {
                objectName: {type: "string"}
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;
                const objectName = ctx.params.objectName;

                try {
                    await this.memoryStore.delete(bucketName, objectName);
                } catch (err) {
                    throw new Error(`Remove object ${objectName} failed`);
                }
                ctx.emit("object.removed", { bucketName: bucketName, objectName: objectName });
                return { bucketName: bucketName, objectName: objectName };
            }
        },        
        
        /**
         * remove multiple object from bucket
         * 
         * @actions
         * @param {array} objectsList - Array of object names
         *
         * @meta
         * @param {string} acl.owner.id - Id of object owner
         * 
         * @returns {object} bucketName, objectName
         */
        removeObjects: {
            acl: {
                before: true
            },
            params: {
                objectsList: { type: "array", items: "string" }
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;
                
                try {
                    ctx.params.objectsList.forEach(objectName => {
                        this.memoryStore.delete(bucketName, objectName);
                    });
                } catch (err) {
                    throw new Error("Failed to remove Objects");
                }
                ctx.emit("objects.removed", { bucketName: bucketName, objects: ctx.params.objectsList });
                return true;
            }
        },        
        
        /**
         * list all objects in the bucket in a readable stream
         * 
         * @actions
         * @param {string} prefix - the prefix of the objects that should be listed (default '')
         * @param {booelan} recursive - true indicates recursive style listing and false indicates directory style listing delimited by '/'
         * @param {string} startAfter - specifies the object name to start after when listing objects in a bucket. (optional, default '')
         * 
         * @returns {ReadableStream} objects 
         */
        // TODO
        listObjects: {
            acl: {
                before: true
            },
            params: {
                prefix: { type: "string", optional: true },
                recursive: { type: "boolean", optional: true },
                startAfter: { type: "string", optional: true }
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;

                try {
                    return this.client.listObjectsV2(bucketName, ctx.params.prefix, ctx.params.recursive, ctx.params.startAfter);
                } catch (err) {
                    throw new Error("Failed to retrieve objects list");
                }
            }
        },    

        /**
         * list all objects in the bucket in an array
         * 
         * @actions
         * @param {string} prefix - the prefix of the objects that should be listed (default '')
         * @param {booelan} recursive - true indicates recursive style listing and false indicates directory style listing delimited by '/'
         * @param {string} startAfter - specifies the object name to start after when listing objects in a bucket. (optional, default '')
         * 
         * @returns {ReadableStream} objects 
         */
        // TODO
        listObjectsArray: {
            acl: {
                before: true
            },
            params: {
                prefix: { type: "string", optional: true },
                recursive: { type: "boolean", optional: true },
                startAfter: { type: "string", optional: true }
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;
                
                try {
                    const list = await new Promise((resolve, reject) => {
                        const stream = this.client.listObjectsV2(bucketName, ctx.params.prefix, ctx.params.recursive, ctx.params.startAfter);
                        const objects = [];
                        stream.on("data", obj => objects.push(obj));
                        stream.on("end", () => resolve(objects));
                        stream.on("error", reject);
                    });
                    return list;
                } catch (err) {
                    this.logger.error("listObjectsArray failed", { bucketName, prefix: ctx.params.prefix, recursive: ctx.params.recursive, startAfter: ctx.params.startAfter });
                    throw new Error("Failed to retrieve objects list");
                }
            }
        },    
        
        /**
         * get meta data of object
         * 
         * @actions
         * @param {string} objectName - Name of the object
         * 
         * @returns {object} stat 
         */
        // TODO
        statObject: {
            acl: {
                before: true
            },
            params: {
                objectName: {type: "string"}
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                let bucketName = owner;
                let objectName = ctx.params.objectName;

                try {
                    return this.client.statObject(bucketName, objectName);
                } catch (err) {
                    throw new Error(`Remove object ${objectName} failed`);
                }
            }
        },        
        
        
        /**
         * get all buckets
         * 
         * @actions
         * 
         * @returns {array} bucket 
         */
        // TODO
        listBuckets: {
            acl: {
                before: true,
                onlyAdminGroup: true
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                
                try {
                    return this.client.listBuckets().then(buckets => buckets ?  buckets : []);
                } catch (err) {
                    this.logger.warn("Failed to retrieve bucket list", { err: err });
                    throw new Error("Failed to retrieve bucket list");
                }
            }
        }

    },

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {
        getOwner (ctx) {
            // mock middleware
            if (!ctx.meta?.acl?.ownerId) {
                const accessToken = jwt.decode(ctx.meta?.acl?.accessToken, { complete: true });
                return accessToken.payload.groupId;
            }

            // already verified in middleware
            if (!ctx.meta?.acl?.ownerId) throw new Error("not authorized");
            return ctx.meta.acl.ownerId;
        }
    },

    /**
     * Service created lifecycle event handler
     */
    created() {
        
        // store settings
        this.memoryStore = new store();

    },

    /**
     * Service started lifecycle event handler
     */
    async started() {},

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
}

module.exports = {
    StoreServiceMock,
    put,
    get,
    getStore  
};