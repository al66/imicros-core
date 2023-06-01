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
const jwt 	= require("jsonwebtoken");
const { pipeline } = require('node:stream/promises');

const { Transform } = require("stream");
const { Readable } = require("stream");

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

class AppendInitVect extends Transform {
    constructor(iv, oekId, opts) {
        super(opts);
        this.iv = iv;
        this.oekId = oekId;
        this.appended = false;
    }

    _transform(chunk, encoding, cb) {
        if (!this.appended) {
            this.push(this.iv);             // iv with fixed length 16
            let buf = Buffer.alloc(100);    // oek id with fixed length 100
            buf.write(this.oekId);
            this.push(buf);
            this.appended = true;
        }
        this.push(chunk);
        cb();
    }

}

/** Actions */
// action makeBucket { region } => { bucketName, region }
// action removeBucket { } => { bucketName, region }
// action putObject { ReadableStream } => { bucketName, objectName }
// action getObject { objectName } => { ReadableStream }
// action removeObject { objectName } => { bucketName, objectName }
// action removeObjects { objectsList } => true | Error
// action statObject { objectName } => { stat }
// action listObjects { prefix, recursive, startAfter} => { ReadableStream obj }
// action listObjectsArray { prefix, recursive, startAfter} => [ obj ]
// action listBuckets { } => [ bucket ]    only for admin service

module.exports = {
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
            acl: "before",
            params: {
                region: {type: "string", optional: true}
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);

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
            acl: "before",
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                let bucketName = owner;

                try {
                    let exists = await this.client.bucketExists(bucketName);
                    if (!exists) throw new Error("Bucket doesn't exsits");
                    await this.client.removeBucket(bucketName);
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
            acl: "before",
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

                // create gzip stream
                const gzip = zlib.createGzip();

                // get encryption stream
                const { cipher } = await ctx.call(`${this.services.groups}.encryptStream`);

                try {
                    await this.client.putObject(
                        params.bucketName, 
                        params.objectName, 
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

                ctx.emit("object.updated", { bucketName: params.bucketName, objectName: params.objectName });
                return { bucketName: params.bucketName, objectName: params.objectName };
            }
        },

        put: {
            acl: "before",
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
                    const action = `${this.version ? "v" + this.version + "." : ""}${this.name}.putObject`;
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
            acl: "before",
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
                    const action = `${this.version ? "v" + this.version + "." : ""}${this.name}.getObject`;
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
            acl: "before",
            params: {
                objectName: [{ type: "string" },{ type: "array" }]
            },
            async handler(ctx) {
                const owner = this.getOwner(ctx);

                const objectName = Array.isArray(ctx.params.objectName) ? ctx.params.objectName.join("/") :ctx.params.objectName;
                this.logger.debug("objectName", { objectName: objectName } );
                
                const bucketName = owner;
                // create unzip stream
                const unzip = zlib.createUnzip();

                // get decryption stream
                const { decipher } = await ctx.call(`${this.services.groups}.decryptStream`);
                
                this.logger.debug("Start streaming", { bucket: bucketName, object: objectName });
                const encrypted = await this.client.getObject(bucketName, objectName);
                return encrypted
                    .pipe(decipher)
                    .on("error", (err) => this.logger.warn("Error decrypting", { bucket: bucketName, object: objectName, err: err }))
                    .pipe(unzip)
                    .on("error", (err) => this.logger.warn("Error streaming", { bucket: bucketName, object: objectName, err: err }));

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
            acl: "before",
            params: {
                objectName: {type: "string"}
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;
                const objectName = ctx.params.objectName;

                try {
                    await this.client.removeObject(bucketName, objectName);
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
            acl: "before",
            params: {
                objectsList: { type: "array", items: "string" }
            },			
            async handler(ctx) {
                const owner = this.getOwner(ctx);
                const bucketName = owner;
                
                try {
                    await this.client.removeObjects(bucketName, ctx.params.objectsList);
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
        listObjects: {
            acl: "before",
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
        listObjectsArray: {
            acl: "before",
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
        statObject: {
            acl: "before",
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
        listBuckets: {
            acl: {
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
            // already verified in middleware
            if (!ctx.meta?.acl?.ownerId) throw new Error("not authorized");
            return ctx.meta.acl.ownerId;
        }
    },

    /**
     * Service created lifecycle event handler
     */
    created() {

        
        // set actions
        this.services = {
            groups: this.settings?.services?.groups ?? "groups"
        };        

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