"use strict";
const { Authorized } = require("imicros-core");

module.exports = {
	// namespace: "",
    // nodeID: "",

    logger: true,
    logLevel: "info",
    logFormatter: "default",

    transporter: process.env.TRANSPORTER_NATS, //"nats://nats:4222",

    middlewares: [Authorized()],

    /*
    cacher: {
        type: "Redis",
        options: {
            redis: {
                host: "192.168.2.124",
                db: 1
            }
        }
    },
    */

    serializer: null,

    requestTimeout: 0 * 1000,
    requestRetry: 0,
    maxCallLevel: 0,
    heartbeatInterval: 5,
    heartbeatTimeout: 15,

    disableBalancer: false,

    registry: {
        strategy: "RoundRobin",
        preferLocal: true
    },

    circuitBreaker: {
        enabled: false,
        maxFailures: 3,
        halfOpenTime: 10 * 1000,
        failureOnTimeout: true,
        failureOnReject: true
    },

    validation: true,
    validator: null,
    metrics: false,
    metricsRate: 1,
    statistics: false,
    internalActions: true,

    hotReload: false
};