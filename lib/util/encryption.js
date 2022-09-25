/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

const crypto = require("crypto");

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
            // hash encription key with iv
            const key = crypto.pbkdf2Sync(sek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
            // encrypt value
            const value = this.encrypt({ value: serialized, secret: key, iv });
            const encrypted = await this.serializer.serialize({
                key: sek.id,
                iv: iv.toString("hex"),
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
            const sek = await this.keys.getKey({ id: container.key });
            // hash received key with salt
            const key = crypto.pbkdf2Sync(sek.key, iv, this.encryption.iterations, this.encryption.keylen, this.encryption.digest);
            const value = this.decrypt({ encrypted, secret: key, iv });
            // deserialize value
            const decrypted = await this.serializer.deserialize(value);
            return decrypted;            
        } catch (err) {
            this.logger.error("failed to decrypt", err);
            throw new Error("failed to decrypt");
        }
    }

}

module.exports = {
    Encryption
};
 
