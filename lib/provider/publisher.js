/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Publisher: Base } = require("../util/publisher");

const Publisher = {

    /**
     * Service created lifecycle event handler
     */
    async created() {
       this.publisher = new Base({ broker: this.broker });
    }
     
} 
 
module.exports = {
   Publisher
}