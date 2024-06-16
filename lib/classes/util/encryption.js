/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 * 
 * @source stream handling based on https://medium.com/@brandonstilson/lets-encrypt-files-with-node-85037bea8c0e
 */
 "use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Transform } = require("stream");

class EncryptStream extends Transform {
    constructor(owner, keys, len, digest) {
        super();
        this.owner = owner;
        this.keys = keys;
        this.len = len;
        this.digest = digest;
        this.appended = false;
    }

    async _transform(chunk, encoding, cb) {
        if (!this.cipher) {
            const iv = crypto.randomBytes(16);
            const key = await this.keys.getKey({ owner: this.owner });
            // console.log({ owner: this.owner, key, iv });
            const fixedKey = crypto.pbkdf2Sync(key.key, iv, 1, this.len, this.digest)
            this.cipher = crypto.createCipheriv('aes-256-cbc', fixedKey, iv);
            this.header = JSON.stringify({ 
                id: key.id, 
                iv: iv.toString('base64'),
                len: this.len,
                digest: this.digest
             });
            this.headerBuffer = Buffer.from(`${this.header}\n`);
        }
        if (!this.appended) {
            this.push(this.headerBuffer);
            this.appended = true;
        }
        this.push(this.cipher.update(chunk));
        cb();
    }

    _flush(cb) {
        this.push(this.cipher.final());
        cb();
    }

}

class DecryptStream extends Transform {
    constructor(owner, keys) {
        super();
        this.owner = owner;
        this.keys = keys;
        this.headerBuffer = Buffer.alloc(0);
    }

    async _transform(chunk, encoding, cb) {
        if (this.headerBuffer.length < 2000 && !this.decipher) {
            this.headerBuffer = Buffer.concat([this.headerBuffer, chunk]);
            const headerString = this.headerBuffer.toString();
            const headerEnd = headerString.indexOf('\n');
            if (headerEnd !== -1) {
                const header = JSON.parse(headerString.slice(0, headerEnd));
                const iv = Buffer.from(header.iv, 'base64');
                const key = await this.keys.getKey({ owner: this.owner, id: header.id });
                // console.log("Key", key, header.id);
                const fixedKey = crypto.pbkdf2Sync(key.key, iv, 1, header.len, header.digest)
                // console.log({ owner: this.owner, key, iv, len:this.len, digest: this.digest });
                this.decipher = crypto.createDecipheriv('aes-256-cbc', fixedKey, iv);
                const data = this.headerBuffer.subarray(this.headerBuffer.indexOf("\n",0,"utf-8") + 1);;
                if (data) {
                    this.push(this.decipher.update(data));
                }
            }
        } else if (this.decipher) {
            this.push(this.decipher.update(chunk));
        }
        cb();
    }
    _flush(cb) {
        if (this.decipher) this.push(this.decipher.final());
        cb();
    }
}
class Encryption {

    constructor ({ logger, keys, serializer, options }) {

         // Moleculer logger
         this.logger = logger;

        // Keys instance
        this.keys = keys;

        // Serializer instance
        this.serializer = serializer;

        // encryption setup
        this.encryption = {
            iterations: options?.encryption?.iterations || 1000,
            ivlen: options?.encryption?.ivlen || 16,
            keylen: options?.encryption?.keylen || 32,
            digest: options?.encryption?.digest || "sha512"
        };

    }

    encrypt ({ value = ".", secret, iv }) {
        let cipher = crypto.createCipheriv("aes-256-cbc", secret, iv);
        let encrypted = cipher.update(value, "utf8", "hex");
        encrypted += cipher.final("hex");
        return encrypted;
    }

    decrypt ({ encrypted, secret, iv }) {
        let decipher = crypto.createDecipheriv("aes-256-cbc", secret, iv);
        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;            
    }

    getHash(value) {
        return crypto.createHash("sha256")
            .update(value)
            .digest("hex");
    }

    async encryptData(obj, owner) {
        // serialize and encrypt user data 
        const sek = await this.keys.getKey({ owner });
        const iv = crypto.randomBytes(this.encryption.ivlen);
        const serialized = await this.serializer.serialize(obj); 
        try {
            // get key of correct length
            const { key } = this.fixKeyLen({ key: sek.key, iv });
            // encrypt value
            const value = this.encrypt({ value: serialized, secret: key, iv });
            const encrypted = await this.serializer.serialize({
                id: sek.id,
                iv: iv.toString("hex"),
                len: this.encryption.keylen,
                digest: this.encryption.digest,
                value    
            });
            return encrypted;
        } catch (err) {
            this.logger.error("Failed to encrypt value", { 
                error: err, 
                iterations: this.encryption.iterations, 
                keylen: this.encryption.keylen,
                digest: this.encryption.digest
            });
            throw new Error("failed to encrypt");
        }
    }

    async decryptData(data, owner) {
        if (!data || !(data.length > 0)) return {};
        try {
            const container = await this.serializer.deserialize(data);
            const iv = Buffer.from(container.iv, "hex");
            const encrypted = container.value;
            const sek = await this.keys.getKey({ id: container.id, owner });
            // get key of correct length
            const { key } = this.fixKeyLen({ key: sek.key, iv, len: container.len, digest: container.digest });
            const value = this.decrypt({ encrypted, secret: key, iv });
            // deserialize value
            const decrypted = await this.serializer.deserialize(value);
            return decrypted;            
        } catch (err) {
            this.logger.error("failed to decrypt", err);
            throw new Error("failed to decrypt");
        }
    }

    encryptStream(owner) {
        const cipher = new EncryptStream(owner, this.keys, this.encryption.keylen, this.encryption.digest);
        return {
            cipher
        };
    }
    
    decryptStream(owner) {
        const decipher = new DecryptStream(owner, this.keys);
        return {
            decipher
        };
    }
    
    async sign({ payload, options = {} }) {
        const sek = await this.keys.getKey();
        options.keyid = sek.id;
        return { token: jwt.sign(payload, sek.key ,options) };
    }

    async verify({ token }) {
        try{
            const decoded = jwt.decode(token,{ complete: true });
            const sek = await this.keys.getKey({ id: decoded.header.kid });
            return { payload: jwt.verify(token, sek.key) };
        } catch (err) {
            this.logger.error("failed to verify token", { token, err });
            throw new Error("no valid token");
        }
    }

    async decode({ token }) {
        try{
            const decoded = jwt.decode(token,{ complete: true });
            return { decoded };
        } catch (err) {
            return { unvalid: true, err };
        }
    }

    randomBytes({ length = 64 } = {}) {
        return crypto.randomBytes(length).toString("hex");
    }

    fixKeyLen({ key, iv, len = null, digest = null }) {
        return {
            // hash - but just to get the correct key length - the key is not saved anyhwere
            key: crypto.pbkdf2Sync(key, iv, 1, len || this.encryption.keylen, digest || this.encryption.digest)
        }
    }

}

module.exports = {
    Encryption
};
 
