/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../util/constants");

/**
 * Class Sequence
 * 
 * Instantiated with the parsed element data
 */
class Sequence {
    constructor({ process, elementData }) {
        this.process = process;
        this.data = elementData;

        this.logger = process.logger;
    }

    getInitialStatus() {
        let status;
        switch ( this.data.type ) {
            // sequence
            case Constants.SEQUENCE_STANDARD:
            case Constants.SEQUENCE_CONDITIONAL:
                status = Constants.SEQUENCE_ACTIVATED;
                break;
        }
        if (!status) this.logger.error("Missing initial status for element type", { type: type });
        return status;
    }   

    activate() {
        // set new status
    }
}

module.exports = { 
    Sequence
};