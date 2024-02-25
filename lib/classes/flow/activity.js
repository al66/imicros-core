/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../util/constants");

/**
 * Class Activity
 * 
 * Instantiated with the parsed activity data
 */
class Activity {
    constructor({ process, elementData }) {
        this.process = process;
        this.data = elementData;

        this.logger = process.logger;
    }

    getInitialStatus() {
        let status;
        switch ( this.data.type ) {
            // task
            case Constants.SEND_TASK:
            case Constants.RECEIVE_TASK:
            case Constants.USER_TASK:
            case Constants.MANUAL_TASK:
            case Constants.BUSINESS_RULE_TASK:
            case Constants.SERVICE_TASK:
            case Constants.SCRIPT_TASK:
                status = Constants.ACTIVITY_ACTIVATED;
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
    Activity
};