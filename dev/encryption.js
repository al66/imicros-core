const crypto = require('crypto');
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
            // console.log({ owner, key, iv, len, digest });
            const fixedKey = crypto.pbkdf2Sync(key.key, iv, 1, this.len, this.digest)
            this.cipher = crypto.createCipheriv('aes-256-cbc', fixedKey, iv);
            this.header = JSON.stringify({ id: key.id, iv: iv.toString('base64') });
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
    constructor(owner, keys, len, digest) {
        super();
        this.owner = owner;
        this.keys = keys;
        this.len = len;
        this.digest = digest;
        this.headerBuffer = Buffer.alloc(0);
    }

    _transform(chunk, encoding, cb) {
        if (this.headerBuffer.length < 1000 && !this.decipher) {
            this.headerBuffer = Buffer.concat([this.headerBuffer, chunk]);
            const headerString = this.headerBuffer.toString();
            const headerEnd = headerString.indexOf('\n');
            if (headerEnd !== -1) {
                const header = JSON.parse(headerString.slice(0, headerEnd));
                const iv = Buffer.from(header.iv, 'base64');
                const key = this.keys.getKey({ owner: this.owner, id: header.id });
                const fixedKey = crypto.pbkdf2Sync(key.key, iv, 1, this.len, this.digest)
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
        this.push(this.decipher.final());
        cb();
    }
}


class StreamEncryption {
  constructor(keys) {
    this.keys = keys;
    this.encryption = {
        keylen: 32,
        digest: "sha512"
    }
  }

  getKey(owner, id) {
    const key = this.keys.getKey({ owner, id });
    if (!key) {
      throw new Error(`No key found for owner ${owner}`);
    }
    return key;
  }

  fixKeyLen({ key, iv, len = null, digest = null }) {
    return {
        // hash - but just to get the correct key length - the key is not saved anyhwere
        key: crypto.pbkdf2Sync(key, iv, 1, len || this.encryption.keylen, digest || this.encryption.digest)
    }
  }

  encryptStream(owner) {
    const cipher = new EncryptStream(owner, this.keys, this.encryption.keylen, this.encryption.digest);
    return {
        cipher
    };
  }

  decryptStream(owner) {
    const decipher = new DecryptStream(owner, this.keys, this.encryption.keylen, this.encryption.digest);
    return {
        decipher
    };
  }

}

module.exports = StreamEncryption;
