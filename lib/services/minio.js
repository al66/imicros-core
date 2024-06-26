/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 *
 * @source https://docs.min.io/docs/javascript-client-api-reference.html
 * @source stream handling based on https://medium.com/@brandonstilson/lets-encrypt-files-with-node-85037bea8c0e
 *
 */
"use strict";

const Minio = require("minio");
const zlib = require("zlib");
const { Readable, Transform } = require("stream");
const { createHash } = require('crypto');

class ReadableObjectStream extends Readable {
    constructor(obj) {
        super();
        if (typeof obj === "object") {
            this.str = JSON.stringify(obj);
        } else if (typeof obj === "string") {
            this.str = obj;
        } else {
            this.str = "";
        }
        this.sent = false;
    }

    _read() {
        if (!this.sent) {
            this.push(Buffer.from(this.str));
            this.sent = true;
        }
        else {
            this.push(null);
        }
    }
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

module.exports = {
    name: "store",
    version: "v1",
    
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
                const owner = this.groups.getOwner({ ctx });

                let bucketName = owner;
                let region = ctx.params.region ? ctx.params.region : this.minio.region;

                try {
                    let exists = await this.client.bucketExists(bucketName);
                    if (exists) throw new Error("Bucket already exsits");
                    await this.client.makeBucket(bucketName, region);
                    this.logger.info("Bucket created successfully", { bucketName: bucketName, region: region });
                } catch (err) {
                    return this.logger.warn("Error creating bucket.", { bucketName: bucketName, region: region, err:err.message });
                }
                ctx.emit("StoreBucketCreated", { bucketName: bucketName, region: region });
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
                const owner = this.groups.getOwner({ ctx });

                let bucketName = owner;

                try {
                    let exists = await this.client.bucketExists(bucketName);
                    if (!exists) throw new Error("Bucket doesn't exsits");
                    await this.client.removeBucket(bucketName);
                    this.logger.info("Bucket removed successfully", { bucketName: bucketName });
                } catch (err) {
                    return this.logger.warn("Error removing bucket.", { bucketName: bucketName, err: err });
                }
                ctx.emit("StoreBucketRemoved", { bucketName: bucketName });
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
                const owner = this.groups.getOwner({ ctx });

                let params = {
                    bucketName: owner,
                    objectName: ctx.meta?.store?.objectName ?? ( ctx.meta?.fieldname ?? ( ctx.meta?.filename ?? "" )),
                    metaData: ctx.meta?.store?.metaData ?? {}
                };
                if (!params.objectName) {
                    this.logger.warn("missing filename", ctx.meta);
                    throw new Error("missing filename");
                }
                // hash object name
                const hashedName = await this.hash(params.objectName);

                // add object name to metadata
                params.metaData["X-Amz-Meta-Private"] = await this.groups.encrypt({ ctx, data: { object: params.objectName }});
                params.metaData["X-Amz-Meta-Hashed"] = await this.hash(params.objectName);

                // create gzip stream
                const gzip = zlib.createGzip();

                // get encryption stream
                const { cipher } = await this.groups.encryptStream({ ctx });

                try {
                    await this.client.putObject(
                        params.bucketName, 
                        hashedName, //params.objectName, 
                        ctx.params
                            .pipe(gzip)
                            .pipe(cipher),
                        params.size, 
                        params.metaData);
                } catch (err) {
                    this.logger.debug("Upload of object failed", { bucketName: params.bucketName, objectName: params.objectName, err: err });
                    this.logger.error("Upload of object failed", { bucketName: params.bucketName, objectName: params.objectName, err: err });
                    throw new Error(`Upload of object ${params.objectName} failed`);
                }

                ctx.emit("StoreObjectUpdated", { bucketName: params.bucketName, objectName: params.objectName });
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
                // create stream from string or object
                let stream;
                let value = ctx.params.value;
                if (typeof value === "number" || typeof value === "boolean") value = JSON.stringify(value);
                if (typeof value === "string") {
                    stream = Readable.from(value);
                } else if (typeof value === "object") {
                    stream = new ReadableObjectStream(value);
                }
                
                // call putObject action
                try {
                    const action = `${this.version ?  this.version + "." : ""}${this.name}.putObject`;
                    let result = await ctx.call(action, stream, { meta: { store: { objectName: ctx.params.objectName } }});
                    return result;
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
            
                function streamToString (stream) {
                    const chunks = [];
                    return new Promise((resolve, reject) => {
                        stream.on("data", chunk => chunks.push(chunk));
                        stream.on("error", reject);
                        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
                    });
                }
              
                // call getObject action
                let params = {
                    objectName: ctx.params.objectName
                };
                try {
                    const action = `${this.version ? this.version + "." : ""}${this.name}.getObject`;
                    const stream = await ctx.call(action, params);
                    const s =  await streamToString(stream);
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
                const owner = this.groups.getOwner({ ctx });

                const objectName = Array.isArray(ctx.params.objectName) ? ctx.params.objectName.join("/") :ctx.params.objectName;
                this.logger.debug("objectName", { objectName: objectName } );
                
                // hash object name
                const hashedName = await this.hash(objectName);

                const bucketName = owner;
                // create unzip stream
                const unzip = zlib.createUnzip();

                // get decryption stream
                const { decipher } = await this.groups.decryptStream({ ctx });
                
                this.logger.debug("Start streaming", { bucket: bucketName, object: hashedName });
                const encrypted = await this.client.getObject(bucketName, hashedName);
                return encrypted
                    .pipe(decipher)
                    .on("error", (err) => this.logger.warn("Error decrypting", { bucket: bucketName, object: hashedName, err: err }))
                    .pipe(unzip)
                    .on("error", (err) => this.logger.warn("Error streaming", { bucket: bucketName, object: hashedName, err: err }));

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
        getCollection: {
            acl: {
                before: true
            },
            params: {
                path: [{ type: "string" },{ type: "array" }]
            },
            async handler(ctx) {
                const owner = this.groups.getOwner({ ctx });
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
                        const { decipher } = await self.groups.decryptStream({ ctx });

                    self.logger.debug("Start streaming", { bucket: bucketName, object: objectName });
                    const encrypted = await self.client.getObject(bucketName, objectName);
                    return encrypted
                        .pipe(decipher)
                        .on("error", (err) => self.logger.warn("Error decrypting", { bucket: bucketName, object: objectName, err: err }))
                        .pipe(unzip)
                        .on("error", (err) => self.logger.warn("Error streaming", { bucket: bucketName, object: objectName, err: err }));
                }

                // hash object name
                const hashedPath = await this.hash(ctx.params.path);

                try {
                    const list = await new Promise((resolve, reject) => {
                        const stream = this.client.extensions.listObjectsV2WithMetadata(bucketName, hashedPath, recursive, startAfter);
                        const objects = [];
                        stream.on("data", obj => objects.push(obj));
                        stream.on("end", () => resolve(objects));
                        stream.on("error", (err) => { console.log(err); return reject });
                    });
                    let merged = {};
                    for (let i=0; i<list.length; i++) {
                        const objectName = list[i].name;
                        const stream = await mergeObject(objectName);
                        const s =  await streamToString(stream);
                        try {
                            const privateData = await this.groups.decrypt({ ctx, encrypted: list[i].metadata["X-Amz-Meta-Private"] });
                            const objectName = privateData.object.split("/").pop();
                            merged[objectName] = JSON.parse(s);
                        } catch (e) {
                            // ignore parsing or decryption errors
                            //console.log(e);
                            //console.log(objectName);
                            //console.log(s);
                        }
                    };
                    return merged;
                } catch (err) {
                    this.logger.error("listObjectsArray failed", { bucketName, prefix: ctx.params.path, recursive, startAfter, err });
                    throw new Error("Failed to retrieve objects list");
                }
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
                const owner = this.groups.getOwner({ ctx });
                const bucketName = owner;
                const objectName = ctx.params.objectName;

                // hash object name
                const hashedName = await this.hash(objectName);

                try {
                    await this.client.removeObject(bucketName, hashedName);
                } catch (err) {
                    throw new Error(`Remove object ${objectName} failed`);
                }
                ctx.emit("StoreObjectRemoved", { bucketName: bucketName, objectName: objectName });
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
                const owner = this.groups.getOwner({ ctx });
                const bucketName = owner;
                
                // hash object names
                const self = this;
                const hashedList = await Promise.all(ctx.params.objectsList.map(obj => self.hash(obj)));

                try {
                    await this.client.removeObjects(bucketName, hashedList);
                } catch (err) {
                    throw new Error("Failed to remove Objects");
                }
                ctx.emit("StoreObjectsRemoved", { bucketName: bucketName, objects: hashedList });
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
                const owner = this.groups.getOwner({ ctx });
                const bucketName = owner;

                const self = this;
                const transform = new Transform({
                    objectMode: true,
                    
                    async transform(chunk, encoding, callback) {
                        const { ...transformed } = chunk;
                        try {
                            const privateData = await self.groups.decrypt({ ctx: ctx, encrypted: chunk.metadata["X-Amz-Meta-Private"] });
                            transformed.name = privateData.object;
                        } catch (err) {
                            self.logger.error("Failed to decrypt object", { obj: chunk, err });
                        }
                        this.push(transformed, encoding);
                        callback();
                    }
                
                })

                try {
                    return this.client.extensions.listObjectsV2WithMetadata(bucketName, ctx.params.prefix, ctx.params.recursive, ctx.params.startAfter).pipe(transform);
                } catch (err) {
                    this.logger.error("listObjects failed", { bucketName, err });
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
                const owner = this.groups.getOwner({ ctx });
                const bucketName = owner;
                
                try {
                    const list = await new Promise((resolve, reject) => {
                        //const stream = this.client.listObjectsV2(bucketName, ctx.params.prefix, ctx.params.recursive, ctx.params.startAfter);
                        const stream = this.client.extensions.listObjectsV2WithMetadata(bucketName, ctx.params.prefix, ctx.params.recursive, ctx.params.startAfter);
                        const objects = [];
                        const self = this;
                        stream.on("data", async obj => {
                            try {
                                const privateData = await this.groups.decrypt({ ctx, encrypted: obj.metadata["X-Amz-Meta-Private"] });
                                obj.name = privateData.object;
                            } catch (err) {
                                self.logger.error("Failed to decrypt object", { obj, err });
                            }
                            objects.push(obj);
                        });
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
        statObject: {
            acl: {
                before: true
            },
            params: {
                objectName: {type: "string"}
            },			
            async handler(ctx) {
                const owner = this.groups.getOwner({ ctx });

                let bucketName = owner;
                let objectName = ctx.params.objectName;

                // hash object name
                const hashedName = await this.hash(objectName);

                try {
                    return this.client.statObject(bucketName, hashedName);
                } catch (err) {
                    throw new Error(`Remove object ${objectName} failed`);
                }
            }
        },        
        
        
    },

    /**
     * Events
     */
    events: {},

    /**
     * Methods
     */
    methods: {

        /**
         * build hash from path
         */
        async hash(path) {
            const isWhitespaceString = str => !str.replace(/\s/g, '').length;
            const s = path.split("/").map(part => isWhitespaceString(part) ? "" : createHash('sha256').update(part).digest('hex')).join("/");
            return s;
        }        
    },

    /**
     * Service created lifecycle event handler
     */
    created() {

        if (!this.groups) throw new Error("Groups provider must be injected first");
        
        // minio settings
        this.minio = {
            region: this.settings?.minio?.region ?? (  process.env.MINIO_REGION_NAME || "eu-central-1" ),
            endPoint: this.settings?.minio?.endPoint ?? ( process.env.MINIO_ENDPOINT || "play.minio.io" ),
            port: Number(this.settings?.minio?.port ?? ( process.env.MINIO_PORT || 9000 )),
            useSSL: this.settings?.minio?.useSSL ?? ( ( process.env.MINIO_NO_SSL || process.env.MINIO_NO_SSL === "true" ) ? false : true )
        };

        // minio client
        this.client = new Minio.Client({
            endPoint: this.minio.endPoint,
            port: this.minio.port,
            useSSL: this.minio.useSSL,
            accessKey: process.env.MINIO_ACCESS_KEY || "Q3AM3UQ867SPQQA43P2F",
            secretKey: process.env.MINIO_SECRET_KEY || "zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG"
        });
    
    },

    /**
     * Service started lifecycle event handler
     */
    async started() {},

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {}
    
};