/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

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

    async encryptData(obj) {
        // serialize and encrypt user data 
        const sek = await this.keys.getKey();
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

    async decryptData(data) {
        if (!data || !(data.length > 0)) return {};
        try {
            const container = await this.serializer.deserialize(data);
            const iv = Buffer.from(container.iv, "hex");
            const encrypted = container.value;
            const sek = await this.keys.getKey({ id: container.id });
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
            throw new Error("no valid token");
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
 
