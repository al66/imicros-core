"use strict";

const InstanceCreatedHandler = require("./instanceCreatedHandler");
const ContextAddedHandler = require("./contextAddedHandler");
const EventOccuredHandler = require("./eventOccuredHandler");
const SequenceActivatedHandler = require("./sequenceActivatedHandler");
const SequenceCompletedHandler = require("./sequenceCompletedHandler");
const GatewayActivatedHandler = require("./gatewayActivatedHandler");
const GatewayCompletedHandler = require("./gatewayCompletedHandler");
const TaskActivatedHandler = require("./taskActivatedHandler");
const TaskCompletedHandler = require("./taskCompletedHandler");

module.exports = {
    InstanceCreatedHandler,
    ContextAddedHandler,
    EventOccuredHandler,
    SequenceActivatedHandler,
    SequenceCompletedHandler,
    GatewayActivatedHandler,
    GatewayCompletedHandler,
    TaskActivatedHandler,
    TaskCompletedHandler
};