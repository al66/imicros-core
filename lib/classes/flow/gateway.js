/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../util/constants");

/**
 * Class Gateway
 * 
 * Instantiated with the parsed element data
 */
class Gateway {
    constructor({ process, elementData }) {
        this.process = process;
        this.data = elementData;

        this.logger = process.logger;
    }

    getInitialStatus() {
        let status;
        switch ( this.data.type ) {
            // gateway
            case Constants.EXCLUSIVE_GATEWAY:
            case Constants.EVENT_BASED_GATEWAY:
            case Constants.PARALLEL_GATEWAY:
            case Constants.INCLUSIVE_GATEWAY:
            case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
            case Constants.PARALLEL_EVENT_BASED_GATEWAY:
                status = Constants.GATEWAY_ACTIVATED;
                break;
        }
        if (!status) this.logger.error("Missing initial status for element type", { type: type });
        return status;
    }   

    activate({ token = null }) {
        // raise event
    }

}

module.exports = { 
    Gateway
};