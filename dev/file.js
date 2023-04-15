const fs = require('fs');
const crypto = require('crypto');
const StreamEncryption = require('./encryption');
const { v4: uuid } = require("uuid");
const zlib = require("zlib");

const owner = uuid();
const keyId = uuid();
const keys = {
    getKey: ({ owner, id }) => {
        return {
            id: keyId,
            key: `Secret of owner ${ owner }`
        };
    }
}


class FileEncryption {
  constructor(keys) {
    this.keys = keys;
    this.streamEncryption = new StreamEncryption(keys);
  }

  async encryptFile(filePath, owner) {
    const readStream = fs.createReadStream(filePath);
    const writeStream = fs.createWriteStream(`${filePath}.enc`);
    const gzip = zlib.createGzip();
    return new Promise((resolve, reject) => {
      const { cipher } = this.streamEncryption.encryptStream(owner);
      readStream
        .pipe(gzip)
        .pipe(cipher)
        .on('error', (error) => reject(error))
        .pipe(writeStream)
        .on('end', () => resolve(`${filePath}.enc`))
        .on('finish', () => resolve(`${filePath}.enc`))
        .on('error', (error) => reject(error));
    });
  }

  async decryptFile(filePath, owner) {
    const readStream = fs.createReadStream(filePath);
    const writeStream = fs.createWriteStream(`${filePath}.dec`);
    const unzip = zlib.createUnzip();
    const { decipher } = this.streamEncryption.decryptStream(owner);
    return new Promise((resolve, reject) => {
        readStream
        .pipe(decipher)
        .on('error', (error) => reject(error))
        .pipe(unzip)
        .pipe(writeStream)
        .on('error', (error) => reject(error))
        .on('end', () => {
            writeStream.end();
            resolve(`${filePath}.dec`);
        });
      });
  }
}

async function run () {
    const fileEncryption = new FileEncryption (keys);
    await fileEncryption.encryptFile("./dev/token.js", owner);
    await fileEncryption.decryptFile("./dev/token.js.enc", owner);
}

run();
