"use strict";

const TOTP = require("../../../lib/mfa/TOTP");
const base32 = require("base32.js");
// const qrcode = require("qrcode");

describe("Test TOTP", () => {
    describe("Test generate secret", () => {

        it("should generate with defaults", () => {
            const secret = TOTP.generateSecret();
            expect(secret.ascii.length).toEqual(32);
            expect(secret.otpauth_url).toBeDefined();
            expect(Buffer.from(secret.hex, "hex").toString("ascii")).toEqual(secret.ascii);
            expect(base32.decode(secret.base32).toString("ascii")).toEqual(secret.ascii);
        })
        it("should generate with custom length", () => {
            const secret = TOTP.generateSecret({ length: 50 });
            expect(secret.ascii.length).toEqual(50);
        })
        it("should generate ascii with defaults", () => {
            const secret = TOTP.generateSecretASCII();
            expect(secret.length).toEqual(32);
            expect(/^[a-z0-9]+$/i.test(secret.ascii)).toEqual(true);
        })
        it("should generate ascii with custom length", () => {
            const secret = TOTP.generateSecretASCII(20);
            expect(secret.length).toEqual(20);
            expect(/^[a-z0-9]+$/i.test(secret.ascii)).toEqual(true);
        })
        it("should generate otpauth url with correct name", async () => {
            const secret = TOTP.generateSecret({ name: "userA@imicros.de", issuer: "imicros.de" });
            const expectedUrl = `otpauth://totp/userA%40imicros.de?secret=${base32.encode(new Buffer.from(secret.ascii, "ascii"))}&issuer=imicros.de&algorithm=SHA1&digits=6&period=30`
            expect(secret.otpauth_url).toBeDefined();
            expect(secret.otpauth_url).toEqual(expectedUrl);
            // const data_url = await qrcode.toDataURL(secret.otpauth_url);
            // console.log(data_url);
            // to be displayed in <img src="...data_url.." />
        })
    });

    describe("Test generate TOTP", () => {
        const options = {
            secret: "12345678901234567890",
            window: 0
        }

        it("should generate a TOTP", () => {
            const totp = TOTP.totp(options);
            expect(totp).toBeDefined();
        })
        it("should generate TOTP's for different times", () => {
            options.time = 59;
            expect(TOTP.totp(options)).toEqual("287082");
            options.time = 1234567890;
            expect(TOTP.totp(options)).toEqual("005924");
            options.time = 1111111109;
            expect(TOTP.totp(options)).toEqual("081804");
            options.time = 2000000000;
            expect(TOTP.totp(options)).toEqual("279037");
        })
    });

    describe("Test verify TOTP", () => {
        const options = {
            secret: "12345678901234567890",
            window: 0
        }

        it("should verify a given token", () => {
            options.token = "WRONG";
            expect(TOTP.totp.verify(options)).toEqual(false);
            options.token = "287082";
            expect(TOTP.totp.verify(options)).toEqual(false);
            options.time = 59;
            options.token = "287082";
            expect(TOTP.totp.verify(options)).toEqual(true);
            options.token = "005924";
            expect(TOTP.totp.verify(options)).toEqual(false);
            options.time = 1234567890;
            options.token = "005924";
            expect(TOTP.totp.verify(options)).toEqual(true);
            options.token = "081804";
            expect(TOTP.totp.verify(options)).toEqual(false);
            options.time = 1111111109;
            options.token = "081804";
            expect(TOTP.totp.verify(options)).toEqual(true);
            options.token = "279037";
            expect(TOTP.totp.verify(options)).toEqual(false);
            options.time = 2000000000;
            options.token = "279037";
            expect(TOTP.totp.verify(options)).toEqual(true);
        })

        it("it should verify a generated token", () => {
            delete options.time;
            options.window = 1;     // allow token for one more period (30 seconds)
            options.token = TOTP.totp(options);
            expect(TOTP.totp.verify(options)).toEqual(true);
            options.time = Date.now() / 1000;
            expect(TOTP.totp.verify(options)).toEqual(true);
            options.time = ( Date.now() / 1000 ) + 60;  // add 2 steps á 30 seconds
            expect(TOTP.totp.verify(options)).toEqual(false);
        })
    });
});

