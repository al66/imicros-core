/**
 * @module repositories/agent.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Repository, Model } = require("../cqrs/cqrs");
const clone = require("rfdc")();    // Really Fast Deep Clone

/**
 * Repository
 */
class AgentRepository extends Repository {
    forModel() { return Agent }
}

/**
 * Model
 */
class Agent extends Model {
    isPersistant () {
        return this.state.createdAt ? true : false;
    }
    hasCredentials ({ credentialsId }) {
        return this.state.credentials[credentialsId] ? true : false;
    }
    isValidSecret({ hashedSecret }) {
        if (!this.state.credentials) return false;
        let result = false;
        Object.entries(this.state.credentials).forEach(([key,value]) => {
            if (value.hashedSecret === hashedSecret) result = true;
        })
        return result;
    }
    isActiveSession(sessionId) {
        return this.state.activeSessions[sessionId] ? true : false;
    }
    getId () {
        return this.state.uid;
    }
    getGroupId () {
        return this.state.groupId;
    }
    getCredentials ({ credentialsId }) {
        const value = clone(this.state.credentials[credentialsId]);
        return value;
    }
    getDetails () {
        const value = clone({
            uid: this.state.uid,
            groupId: this.state.groupId,
            label: this.state.label,
            credentials: this.state.credentials || {}
        });
        return value;
    }
    getTokenData () {
        return {
            uid: this.state.uid,
            groupId: this.state.groupId,
            label: this.state.label,
            createdAt: this.state.createdAt
        };
    }
    onAgentCreated (event) {
        this.state.uid = event.agentId;
        this.state.groupId = event.groupId;
        this.state.createdAt = event.createdAt;
        this.state.label = event.label;
        this.state.activeSessions = {};
    } 
    onAgentRenamed (event) {
        this.state.label = event.label;
    }
    onCredentialsCreated (event) {
        const credentials = clone(event.credentials);
        credentials.createdAt = event.createdAt; 
        if (!this.state.credentials) this.state.credentials = {};
        this.state.credentials[event.credentialsId] = credentials;
    }
    onCredentialsDeleted (event) {
        if (this.state.credentials[event.credentialsId]) delete this.state.credentials[event.credentialsId];
    }
    onAgentLoggedIn (event) {
        this.state.lastLogInAt = event.LoggedInAt;
        this.state.activeSessions[event.sessionId] = event.authToken; 
    }
    onAgentLoggedOut (event) {
        delete this.state.activeSessions[event.sessionId];
    }
}

module.exports = {
    AgentRepository
} 
