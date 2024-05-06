/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

class Exception extends Error {
    constructor(attributes = {}) {
        super("");
        // Error.captureStackTrace(this, this.constructor);
        Error.captureStackTrace(this);
        this.message = this.constructor.name;
        for (const [attribute, value] of Object.entries(attributes)) this[attribute] = value;
    }
 }

class MissingCommandhandler extends Exception {};
class MissingQueryhandler extends Exception {};

module.exports = {
    MissingCommandhandler,
    MissingQueryhandler
}