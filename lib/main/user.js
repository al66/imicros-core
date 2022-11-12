/**
 * @module user.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { v4: uuid } = require("uuid");
 
 /**
  * 
  */
 class User {
 
    /**
     * 
     * @param {Object}  param
     * @param {Object}  param.DB - instance of database
     * @param {Object}  param.logger - reference to the broker logger
     * @param {Object}  param.options - ...
     */
     constructor({ db, logger, options = {} }) {
        this.db = db;
        this.logger = logger;
    }


    add ({ mail, pasword, locale }) {
        // 
    }

    login({ mail, password }) {

    }

    get({ authToken }) {

    }

    requestConfirmation({ authToken }) {

    }

    confirm({ confirmationToken }) {

    }

    requestPasswordReset({ mail }) {

    }

    resetPassword({ resetToken, password }) {

    }

    generateTOTP({ authToken }) {

    }

    activateTOTP({ authToken, secret, totp }) {

    }

    verifyTOTP({ authToken, totp }) {

    }

    requestDeletion({ authToken }) {

    }

    delete({ deletionToken }) {

    }

    async _getPayload({ token, type }) {
        const { payload } = await this.db.encryption.verify({ token });
        if (payload.type !== type) throw new Error(`Wrong token - token of type ${type} expected`);
        return payload;
    }

 }
 
 module.exports = {
    User
};