const crypto = require("crypto");
const assert = require("node:assert");

/** More complex example */

// Generate Alice's keys...
const alice = crypto.createDiffieHellman(2048);
const aliceKey = alice.generateKeys();

// Generate Bob's keys...
const bob = crypto.createDiffieHellman(alice.getPrime(), alice.getGenerator());
console.log(alice.getPrime().toString('hex'));
console.log(alice.getGenerator().toString('hex'));
const bobKey = bob.generateKeys();

// Exchange and generate the secret...
const aliceSecret = alice.computeSecret(bobKey);
const bobSecret = bob.computeSecret(aliceKey);

// OK
assert.strictEqual(aliceSecret.toString('hex'), bobSecret.toString('hex'));
console.log(aliceSecret.toString('hex'));
console.log(bobSecret.toString('hex'));

console.log(aliceSecret.toString('hex') ===  bobSecret.toString('hex'));

/** Simple example */

// Generate broker A keys
const brokerA = crypto.getDiffieHellman("modp14");
const publicKeyA = brokerA.generateKeys();

// Generate broker B keys
const brokerB = crypto.getDiffieHellman("modp14");
const publicKeyB = brokerB.generateKeys();

// Exchange and generate the secret...
const secretBrokerA = brokerA.computeSecret(publicKeyB);
const secretBrokerB = brokerB.computeSecret(publicKeyA);

console.log(secretBrokerA.toString("hex") === secretBrokerB.toString("hex"));


