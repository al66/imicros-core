/**
 * @module events/agent/events.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

/**
 * Events
 */
class AgentCreated {
    constructor({ groupId, agentId }) {
        this.createdAt = new Date().getTime();
        this.groupId = groupId;
        this.agentId = agentId;
    }

}

module.exports = {
    AgentCreated
}