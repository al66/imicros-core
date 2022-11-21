/**
 * @module repositories/agent.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { Repository, Model } = require("../../cqrs/cqrs");

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
}

module.exports = {
    AgentRepository
} 
