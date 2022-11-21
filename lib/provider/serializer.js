/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Serializer: Base } = require("../util/serializer");

const Serializer = {

    /**
     * Service created lifecycle event handler
     */
     async created() {
        this.serializer = new Base();
    }
    
} 

module.exports = {
    Serializer
}