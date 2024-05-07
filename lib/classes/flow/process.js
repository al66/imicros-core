/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Application } = require("./basic/application");

const CommandHandler = require("./commands/handler");
const EventHandler = require("./events/handler");

const { InstanceMachine, 
    SequenceMachine,
    EventMachine,
    GatewayMachine,
    TaskMachine,
    JobMachine
  } = require("./machines/machines");

const { Constants } = require("../util/constants");
const { Interpreter } = require("imicros-feel-interpreter");
const { Cycle } = require("../timer/cycle");
const { v4: uuid } = require("uuid");
const crypto = require("crypto");


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

    async getProcess() {
        await this.waitIdle();
        const instance = Object.keys(this.repository).find(modelId => this.repository[modelId].getMachineName() === "InstanceMachine");
        if (instance) {
            const processData = this.repository[instance].context.processData;
            return {
                processId: processData.process.id,
                versionId: processData.version.id,
            }
        }
        return {};
    }

    async getJobs({ version }) {
        await this.waitIdle();
        const jobs = [...Object.keys(this.repository).map(modelId => this.repository[modelId].getMachineName() === "JobMachine" ? this.repository[modelId].context.job : [] )].flat();
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

    isCompleted() {
        //TODO
        return false;
    }

    async persistApp({ owner, accessToken, events }) {
        const process = await this.getProcess();
        await this.db.persistApp({ 
            owner,
            accessToken,
            processId: process.processId,
            versionId: process.versionId,
            uid: this.uid,
            version: this.version,
            event: events 
        })
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

    /**
     * get initial subscriptions and timers from process
     * 
     * @param {Object} processData      parsed process data
     * 
     * @returns {Object}  { subscriptions: [{Object}], timers: [{Object}] }
     */
    getInitialEvents({ processData }) {
        // this.logger.info("Get subscriptions",{ processData });
        const result = { subscriptions: [], timers: [] };
        for (const event of processData.event) {
            if (event.position === Constants.START_EVENT) {
                switch (event.type) {
                    case Constants.DEFAULT_EVENT:
                        result.subscriptions.push({
                            subscriptionId: uuid(),
                            type: Constants.SUBSCRIPTION_TYPE_EVENT,
                            hash: this.getHash(event.localId || event.name),
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            correlation: null,
                            condition: null
                        });
                        break;
                    case Constants.MESSAGE_EVENT:
                        result.subscriptions.push({
                            subscriptionId: uuid(),
                            type: Constants.SUBSCRIPTION_TYPE_MESSAGE,
                            hash: this.getHash(event.messageCode || event.id), // does not work w/o messageCode
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            correlation: null,
                            condition: null
                        });
                        break;
                    case Constants.TIMER_EVENT:
                        const schedule = this.getTimerSchedule({ ownerId: processData.process.ownerId, timer: event.timer });
                        result.timers.push({
                            timerId: schedule.id,
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            timer: schedule.timer,
                            day: schedule.day,
                            time: schedule.time,
                            partition: schedule.partition,
                        });
                        break;
                    case Constants.ESCALATION_EVENT:
                        break;
                    case Constants.CONDITIONAL_EVENT:
                        break;
                    case Constants.SIGNAL_EVENT:
                        result.subscriptions.push({
                            subscriptionId: uuid(),
                            type: Constants.SUBSCRIPTION_TYPE_SIGNAL,
                            hash: this.getHash(event.localId || event.name),
                            processId: processData.process.id,
                            versionId: processData.version.id,
                            correlation: null,
                            condition: null
                        });
                        break;
                    default:
                        break;
                }
            }
        }
        return result;
    }

    getHash(value) {
        return crypto.createHash("sha256")
            .update(`${value}`.toString(), "utf8")
            .digest("hex");
    }

    getTimerSchedule({ ownerId, timer }) {
        const value = timer.expression?.substring(0,1) === "=" ? this.feel.evaluate(timer.expression) : timer.expression;
        let date = null;
        try {
            switch (timer.type) {
                case Constants.TIMER_DATE:
                    date = new Date(value);
                    timer.current = date;
                    break;
                case Constants.TIMER_CYCLE: {
                        const cycle = new Cycle(value);
                        date = cycle.next({ current: timer.current ? new Date(timer.current) : null, cycleCount: timer.cycleCount || 0 });
                        timer.current = date;
                        timer.cycleCount = ( timer.cycleCount || -1 ) + 1;
                    }
                    break;
                case Constants.TIMER_DURATION: {
                        const cycle = new Cycle(value);
                        date = cycle.next({ current: new Date(), cycleCount: timer.cycleCount || 0 });
                    }
                    break;
            }   
            const day = date.toISOString().substring(0,10);
            const time = date.toISOString().substring(11,19);
            // TODO determine partition based on onwerId
            const partition = 0;
            return {
                day,
                time,
                partition,
                id: uuid(),
                timer
            }
        } catch (err) { 
            this.logger.debug("Invalid timer expression",{ timer, error: err.message });
            throw new Error("Invalid timer expression", { timer });
        }
    }

}

module.exports = {
    Process
};

