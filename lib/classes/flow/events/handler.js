/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const InstanceCreatedHandler = require("./instanceCreatedHandler");
const ContextAddedHandler = require("./contextAddedHandler");
const EventActivatedHandler = require("./eventActivatedHandler");
const EventSubscriptionAddedHandler = require("./eventSubscriptionAddedHandler");
const EventOccuredHandler = require("./eventOccuredHandler");
const TimerScheduledHandler = require("./timerScheduledHandler");
const SequenceActivatedHandler = require("./sequenceActivatedHandler");
const SequenceCompletedHandler = require("./sequenceCompletedHandler");
const GatewayActivatedHandler = require("./gatewayActivatedHandler");
const GatewayProcessedHandler = require("./gatewayProcessedHandler");
const GatewayCompletedHandler = require("./gatewayCompletedHandler");
const TaskActivatedHandler = require("./taskActivatedHandler");
const TaskStartedHandler = require("./taskStartedHandler");
const TaskFinishedHandler = require("./taskFinishedHandler");
const TaskFailedHandler = require("./taskFailedHandler");
const TaskCompletedHandler = require("./taskCompletedHandler");
const JobCreatedHandler = require("./jobCreatedHandler");
const JobFailedHandler = require("./jobFailedHandler");
const JobFinishedHandler = require("./jobFinishedHandler");

module.exports = {
    InstanceCreatedHandler,
    ContextAddedHandler,
    EventActivatedHandler,
    EventSubscriptionAddedHandler,
    EventOccuredHandler,
    TimerScheduledHandler,
    SequenceActivatedHandler,
    SequenceCompletedHandler,
    GatewayActivatedHandler,
    GatewayProcessedHandler,
    GatewayCompletedHandler,
    TaskActivatedHandler,
    TaskStartedHandler,
    TaskFinishedHandler,
    TaskFailedHandler,
    TaskCompletedHandler,
    JobCreatedHandler,
    JobFailedHandler,
    JobFinishedHandler
};