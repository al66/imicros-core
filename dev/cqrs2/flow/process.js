"use strict";

const { Application } = require("../basic/application");

const CommandHandler = require("./commands/handler");
const EventHandler = require("./events/handler");

const { InstanceMachine, 
    SequenceMachine,
    EventMachine,
    GatewayMachine,
    TaskMachine,
    JobMachine
  } = require("./machines/machines");

const { Interpreter } = require("imicros-feel-interpreter");

class Process extends Application {
    constructor({ db, logger }) {
        const providers = [
            ...Object.keys(CommandHandler).map(key => CommandHandler[key]),
            ...Object.keys(EventHandler).map(key => EventHandler[key])
        ];
        super({ db, logger, providers });

        this.feel =new Interpreter();
    }

    evaluate({ expression, context = {} }) {
        return this.feel.evaluate(expression, context);
    }

    async getJobs({ version }) {
        await this.waitIdle();
        const jobs = [...Object.keys(this.repository).map(modelId => this.repository[modelId].context?.jobs || [] )].flat();
        return jobs.filter(job => job.version === version);
    }

    async getDecisions({ version }) {
        await this.waitIdle();
        const decisions = [...Object.keys(this.repository).map(modelId => this.repository[modelId].context?.decisions || [] )].flat();
        return decisions.filter(decision => decision.version === version);
    }

    async getThrowing({ version }) {
        await this.waitIdle();
        const throwing = [...Object.keys(this.repository).map(modelId => this.repository[modelId].context?.throwing || [] )].flat();
        return throwing.filter(event => event.version === version);
    }

    getMachineByName(name) {
        switch (name) {
            case "SequenceMachine":
                return SequenceMachine;
            case "InstanceMachine":
                return InstanceMachine;
            case "GatewayMachine":
                return GatewayMachine;
            case "EventMachine":
                return EventMachine;
            case "TaskMachine":
                return TaskMachine;
            case "JobMachine":
                return JobMachine;
        }
    }

}

module.exports = {
    Process
};

