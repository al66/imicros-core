/**
 * @license MIT, imicros.de (c) 2023 Andreas Leinen
 */
"use strict";

/* istanbul ignore file */
class Constants {

    // Auth: Token types
    static get TOKEN_TYPE_USER() { return "userToken"; }
    static get TOKEN_TYPE_AGENT() { return "agentToken"; }
    static get TOKEN_TYPE_AUTH() { return "authToken"; }
    static get TOKEN_TYPE_MFA() { return "mfaToken"; }
    static get TOKEN_TYPE_RESET_PASSWORD() { return "resetToken"; }
    static get TOKEN_TYPE_USER_DELETION() { return "userDeletionToken"; }
    static get TOKEN_TYPE_GROUP_ACCESS() { return "accessToken"; }
    static get TOKEN_TYPE_ACCESS_INTERNAL() { return "accessTokenInternal"; }
    static get TOKEN_TYPE_INVITATION() { return "invitationToken"; }
    static get TOKEN_TYPE_GROUP_DELETION() { return "deletionToken"; }
    static get TOKEN_TYPE_EXCHANGE_FETCH() { return "exchangeFetchToken"; }
    // Exchange: Box codes
    static get INBOX() { return 1; }
    static get OUTBOX() { return 2; }
    // Excghange: Pathes
    static get INBOX_PATH() { return "~inbox/"; }
    static get OUTBOX_PATH() { return "~outbox/"; }
    // Exchange: Status codes
    static get STATUS_SEND() { return 100; }
    static get STATUS_RECEIVE() { return 100; }
    static get STATUS_COMPLETE() { return 200; }
    // Exchange: Local
    static get LOCAL_URL() { return "local"; }
    // Exchange: Error codes
    static get ERROR_NOT_AUTHORIZED() { return 100; }
    static get ERROR_EXCHANGE_NOT_ACCEPTED() { return 101; }
    static get ERROR_ADD_MESSAGE_OUT() { return 102; }
    static get ERROR_SAVE_MESSAGE_OUT() { return 103; }
    static get ERROR_ADD_MESSAGE_IN() { return 104; }
    static get ERROR_REQUEST_ACCESS() { return 105; }
    static get ERROR_SAVE_MESSAGE_IN() { return 106; }
    static get ERROR_CONFIRM_MESSAGE_SENT() { return 107; }
    static get ERROR_UPDATE_WHITELIST() { return 108; }
    static get ERROR_DATABASE() { return 109; }
    static get ERROR_SAVE_APPENDIX_IN() { return 110; }
    static get ERROR_READ_MESSAGE() { return 111; }
    static get ERROR_EXCHANGE_NOTIFY() { return 112; }
    static get ERROR_EXCHANGE_VERIFY() { return 113; }
    static get ERROR_EXCHANGE_MESSAGE_EXISTS() { return 114; }
    static get ERROR_EXCHANGE_FETCH() { return 115; }
    // Flow
    static get STATIC_GROUP() { return "flow"; }
    // Flow: Execution platform
    static get PLATFORM_FLOW() { return "flow"; }
    static get PLATFORM_CAMUNDA() { return "zeebe"; }
    // Flow: Task types
    static get TASK() { return "Task"; }
    static get SEND_TASK() { return "Send Task"; }
    static get RECEIVE_TASK() { return "Receive Task"; }
    static get USER_TASK() { return "User Task"; }
    static get MANUAL_TASK() { return "Manual Task"; }
    static get BUSINESS_RULE_TASK() { return "Business Rule Task"; }
    static get SERVICE_TASK() { return "Service Task"; }
    static get SCRIPT_TASK() { return "Script Task"; }
    static get CALL_ACTIVITY() { return "Call Activity"; }
    // Flow: Gateway types
    static get EXCLUSIVE_GATEWAY() { return "Exclusive Gateway"; }
    static get EVENT_BASED_GATEWAY() { return "Event-based Gateway"; }
    static get PARALLEL_GATEWAY() { return "Parallel Gateway"; }
    static get INCLUSIVE_GATEWAY() { return "Inclusive Gateway"; }
    static get COMPLEX_GATEWAY() { return "Complex Gateway"; }
    static get EXCLUSIVE_EVENT_BASED_GATEWAY() { return "Exclusive Event-based Gateway"; }
    static get PARALLEL_EVENT_BASED_GATEWAY() { return "Parallel Event-based Gateway"; }
    // Flow: Event positions
    static get START_EVENT() { return "Start Event"; }
    static get INTERMEDIATE_EVENT() { return "Intermediate Event"; }
    static get BOUNDARY_EVENT() { return "Boundary Event"; }
    static get END_EVENT() { return "End Event"; }
    // Flow: Event types
    static get DEFAULT_EVENT() { return "Default Event"; }
    static get MESSAGE_EVENT() { return "Message Event"; }
    static get TIMER_EVENT() { return "Timer Event"; }
    static get ESCALATION_EVENT() { return "Escalation Event"; }
    static get CONDITIONAL_EVENT() { return "Conditional Event"; }
    static get ERROR_EVENT() { return "Error Event"; }
    static get CANCEL_EVENT() { return "Cancel Event"; }
    static get COMPENSATION_EVENT() { return "Compensation Event"; }
    static get SIGNAL_EVENT() { return "Signal Event"; }
    static get MULTIPLE_EVENT() { return "Multiple Event"; }
    static get PARALLEL_MULTIPLE_EVENT() { return "Parallel Multiple Event"; }
    static get TERMINATE_EVENT() { return "Terminate Event"; }
    // Flow: Event directions
    static get CATCHING_EVENT() { return "Catching Event"; }
    static get THROWING_EVENT() { return "Throwing Event"; }
    // Flow: Event interactions
    static get BOUNDARY_INTERRUPTING_EVENT() { return "Boundary Interupting Event"; }
    static get BOUNDARY_NON_INTERRUPTING_EVENT() { return "Boundary Non-Interrupting Event"; }
    // Flow: Timer types
    static get TIMER_DURATION() { return "Duration"; }
    static get TIMER_CYCLE() { return "Cycle"; }
    static get TIMER_DATE() { return "Date"; }
    // Flow: Sequence flow types
    static get SEQUENCE_STANDARD() { return "DIRECT"; }
    static get SEQUENCE_CONDITIONAL() { return "CONDITIONAL"; }
    // Flow: Token status
    static get SEQUENCE_ACTIVATED() { return "SEQUENCE.ACTIVATED"; }
    static get SEQUENCE_REJECTED() { return "SEQUENCE.REJECTED"; }
    static get SEQUENCE_ERROR() { return "SEQUENCE.ERROR"; }
    static get SEQUENCE_COMPLETED() { return "SEQUENCE.COMPLETED"; }
    static get SEQUENCE_ERROR() { return "SEQUENCE.ERROR"; }
    static get EVENT_ACTIVATED() { return "EVENT.ACTIVATED"; }
    static get EVENT_READY() { return "EVENT.READY"; }
    static get EVENT_WAITING() { return "EVENT.WAITING"; }
    static get EVENT_ERROR() { return "EVENT.ERROR"; }
    static get EVENT_OCCURED() { return "EVENT.OCCURED"; }
    static get PROCESS_ACTIVATED() { return "PROCESS.ACTIVATED"; }
    static get ACTIVITY_ACTIVATED() { return "ACTIVITY.ACTIVATED"; }
    static get ACTIVITY_READY() { return "ACTIVITY.READY"; }
    static get ACTIVITY_COMPLETED() { return "ACTIVITY.COMPLETED"; }
    static get ACTIVITY_ERROR() { return "ACTIVITY.ERROR"; }
    static get GATEWAY_ACTIVATED() { return "GATEWAY.ACTIVATED"; }
    static get GATEWAY_COMPLETED() { return "GATEWAY.COMPLETED"; }
    static get GATEWAY_RED_BUTTON() { return "GATEWAY.RED_BUTTON"; }
    static get PROCESS_ERROR() { return "PROCESS.ERROR"; }
    // Flow: Instance status
    static get INSTANCE_RUNNING() { return "INSTANCE.RUNNING"; }
    static get INSTANCE_FAILED() { return "INSTANCE.FAILED"; }
    static get INSTANCE_COMPLETED() { return "INSTANCE.COMPLETED"; }
    // Flow: Context
    static get CONTEXT_ERROR() { return "_ERROR"; }     
    // Flow: Subscription types
    static get SUBSCRIPTION_TYPE_SIGNAL() { return "SIGNAL"; }
    static get SUBSCRIPTION_TYPE_MESSAGE() { return "MESSAGE"; }
    static get SUBSCRIPTION_TYPE_EVENT() { return "EVENT"; }
    // Flow: Queue types
    static get QUEUE_TOPIC_EVENTS() { return "events"; }
    static get QUEUE_TOPIC_INSTANCE() { return "instance"; }
    static get QUEUE_TOPIC_MESSAGES() { return "messages"; }
    // Flow: Queue events
    static get QUEUE_EVENT_RAISED() { return "event.raised"; }
    static get QUEUE_INSTANCE_REQUESTED() { return "instance.requested"; }
}

module.exports = { Constants };