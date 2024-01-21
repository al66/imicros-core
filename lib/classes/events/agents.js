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
    constructor({ groupId, agentId, label }) {
        this.createdAt = new Date().getTime();
        this.groupId = groupId;
        this.agentId = agentId;
        this.label = label;
    }

}
class AgentRenamed {
    constructor({ groupId, agentId, label }) {
        this.renamedAt = new Date().getTime();
        this.groupId = groupId;
        this.agentId = agentId;
        this.label = label;
    }
}
 
class CredentialsCreated {
    constructor({ groupId, agentId, credentialsId, credentials }) {
        this.createdAt = new Date().getTime();
        this.groupId = groupId;
        this.agentId = agentId;
        this.credentialsId = credentialsId;
        this.credentials = credentials;
    }
}

class CredentialsDeleted {
    constructor({ groupId, agentId, credentialsId }) {
        this.deletedAt = new Date().getTime();
        this.groupId = groupId;
        this.agentId = agentId;
        this.credentialsId = credentialsId;
    }
}

class AgentLoggedIn {
    constructor({ agentId, sessionId, authToken }) {
        this.loggedInAt = new Date().getTime();
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.authToken = authToken;
    }
}
class AgentLoggedOut {
    constructor({ agentId, sessionId, authToken }) {
        this.loggedOutAt = new Date().getTime();
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.authToken = authToken;
    }
}
class AgentDeleted {
    constructor({ groupId, agentId, deletedBy }) {
        this.deletedAt = new Date().getTime();
        this.groupId = groupId;
        this.agentId = agentId;
        this.deletedBy = deletedBy;
    }
}

module.exports = {
    AgentCreated,
    AgentRenamed,
    CredentialsCreated,
    CredentialsDeleted,
    AgentLoggedIn,
    AgentLoggedOut,
    AgentDeleted
}