/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../util/constants");

// events
const { EventMachine } = require("./machines/event");
const { MessageEndEventMachine } = require("./machines/event.end.message");
const { MessageIntermediateThrowingMachine } = require("./machines/event.intermediate.throwing.message");
const { TimerStartEventMachine } = require("./machines/event.start.timer");
// sequences
const { SequenceMachine } = require("./machines/sequence");
// tasks
const { TaskMachine } = require("./machines/task");
const { BusinessRuleTaskMachine } = require("./machines/task.business.rule");
const { ServiceTaskMachine } = require("./machines/task.service");
const { SendTaskMachine } = require("./machines/task.send");
// gateways
const { GatewayMachine } = require("./machines/gateway");
const { ParallelGatewayMachine } = require("./machines/gateway.parallel");
const { ExclusiveGatewayMachine } = require("./machines/gateway.exclusive");

function getElementMachine (element) {
    switch (element.type) {
        // events
        case Constants.DEFAULT_EVENT:
        case Constants.ESCALATION_EVENT:
        case Constants.CONDITIONAL_EVENT:
        case Constants.ERROR_EVENT:
        case Constants.CANCEL_EVENT:
        case Constants.COMPENSATION_EVENT:
        case Constants.SIGNAL_EVENT:
        case Constants.MULTIPLE_EVENT:
        case Constants.PARALLEL_MULTIPLE_EVENT:
        case Constants.TERMINATE_EVENT:
            return EventMachine;
        case Constants.MESSAGE_EVENT:
            switch (element.position) {
                case Constants.END_EVENT:
                    return MessageEndEventMachine;
                case Constants.INTERMEDIATE_EVENT:
                    switch (element.direction) {
                        case Constants.THROWING_EVENT:
                            return MessageIntermediateThrowingMachine;
                        default:
                            return EventMachine;
                    }
                default:
                    return EventMachine;
            }
        case Constants.TIMER_EVENT:
            switch (element.position) {
                case Constants.START_EVENT:
                    return TimerStartEventMachine;
                default:
                    return EventMachine;
            }
        // sequences
        case Constants.SEQUENCE_STANDARD:
        case Constants.SEQUENCE_CONDITIONAL:
            return SequenceMachine;
        // tasks
        case Constants.BUSINESS_RULE_TASK:
            return BusinessRuleTaskMachine;
        case Constants.SERVICE_TASK:
            return ServiceTaskMachine;
        case Constants.SEND_TASK:
            return SendTaskMachine
        case Constants.TASK:
        case Constants.RECEIVE_TASK:
        case Constants.USER_TASK:
        case Constants.MANUAL_TASK:
        case Constants.SCRIPT_TASK:
        case Constants.CALL_ACTIVITY:
            return TaskMachine;
        // gateways
        case Constants.PARALLEL_GATEWAY:
            return ParallelGatewayMachine;
        case Constants.EXCLUSIVE_GATEWAY:
            return ExclusiveGatewayMachine;
        case Constants.EVENT_BASED_GATEWAY:
        case Constants.INCLUSIVE_GATEWAY:
        case Constants.COMPLEX_GATEWAY:
        case Constants.EXCLUSIVE_EVENT_BASED_GATEWAY:
        case Constants.PARALLEL_EVENT_BASED_GATEWAY:
            return GatewayMachine;
        default:
            return null;
    }
}

module.exports = {
    getElementMachine
};
