/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../util/constants");

/**
 * Class Event
 * 
 * Instantiated with the parsed event data
 */
class Event {
    constructor({ process, elementData }) {
        this.process = process;
        this.data = elementData;

        this.logger = process.logger;
    }

    getInitialStatus() {
        let status;
        switch ( this.data.type ) {
            // event
            case Constants.DEFAULT_EVENT:
            case Constants.MESSAGE_EVENT:
            case Constants.TIMER_EVENT:
            case Constants.ESCALATION_EVENT:
            case Constants.CONDITIONAL_EVENT:
            case Constants.ERROR_EVENT:
            case Constants.CANCEL_EVENT:
            case Constants.COMPENSATION_EVENT:
            case Constants.SIGNAL_EVENT:
            case Constants.MULTIPLE_EVENT:
            case Constants.PARALLEL_MULTIPLE_EVENT:
            case Constants.TERMINATE_EVENT:
                status = Constants.EVENT_ACTIVATED;
                break;
        }
        if (!status) this.logger.error("Missing initial status for element type", { type: type });
        return status;
    }   

    async processToken({ token = {} }) {

        switch ( token.status ) {
            case Constants.EVENT_ACTIVATED:
                await this.prepareEvent({ token });
                break;
            case Constants.EVENT_READY:
                await this.processEvent({ token });
                break;
            case Constants.EVENT_OCCURED:
                // activate next
                await this.process.logToken ({ consume: [token] });
                await this.process.activateNext({ token });
                break;
            default:
                // ignore token
        }           

        return true;
    }

    async prepareEvent({ token = {} }) {
        // evaluate condition

        // consume token and emit next token with status "event ready" 
        let newToken = this.process.setNewTokenStatus({ token, status: Constants.EVENT_READY })
        // in case of start event we have to set the instanceId
        if (!newToken.instanceId) newToken.instanceId = this.process.instanceId;
        await this.process.logToken ({ consume: [token], emit: [newToken] });
        return true;
    }   

    async processEvent({ token = {} }) {
        // get payload and add to context
        

        // set token status to "event occured"
        let newToken = this.process.setNewTokenStatus({ token, status: Constants.EVENT_OCCURED })
        await this.process.logToken ({ consume: [token], emit: [newToken] });
        return true;
    }

}

module.exports = { 
    Event
};