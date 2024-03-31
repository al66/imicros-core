/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Serializer: Base } = require("../classes/util/serializer");

// TODO rename class to SerializerProvider

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