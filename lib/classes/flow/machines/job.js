/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { JobFailed,
        JobFinished } = require("./../events/events");
const { CommitTask,
        CommitEvent } = require("./../commands/commands");
const instance = require("./instance");

module.exports = {
    name: "JobMachine",
    initialState: "created",
    states: {
        onJobCreated: ({ event, self }) => {
            self.uid = event.jobId;
            self.context.instanceId = event.instanceId;
            self.context.originId = event.originId;
            self.context.type = event.type;
            if (event.type === "task") {
                self.context.job = {
                    jobId: event.jobId,
                    instanceId: event.instanceId,    
                    version: event.version,
                    taskDefinition: event.taskDefinition,
                    data: event.data
                };
            }
            if (event.type === "event") {
                self.context.job = {
                    jobId: event.jobId,
                    instanceId: event.instanceId,    
                    version: event.version,
                    taskDefinition: event.taskDefinition,
                    data: event.data
                };
            }
            if (event.type === "rule") {
                self.context.job = {
                    jobId: event.jobId,
                    instanceId: event.instanceId,    
                    version: event.version,
                    calledDecision: event.calledDecision,
                    data: event.data
                };
            }
            self.state = "waiting";
        },
        waiting: {
            onCommitJob: ({ command, self }) => {
                if (!command.error) {
                    switch (self.context.type) {
                        case "task":
                            self.execute(new CommitTask({ instanceId: self.context.instanceId, elementId: self.context.originId, result: command.result}));
                            break;
                        case "rule":
                            self.execute(new CommitTask({ instanceId: self.context.instanceId, elementId: self.context.originId, result: command.result}));
                            break;
                        case "event":
                            self.execute(new CommitEvent({ instanceId: self.context.instanceId, elementId: self.context.originId, result: command.result}));
                            break;
                    }
                    self.emit(new JobFinished({ instanceId: self.context.instanceId, jobId: command.jobId, result: command.result}));
                } else {
                    switch (self.context.type) {
                        case "task":
                            self.execute(new CommitTask({ instanceId: self.context.instanceId, elementId: self.context.originId, error: command.error }));
                            break;
                        case "rule":
                            self.execute(new CommitTask({ instanceId: self.context.instanceId, elementId: self.context.originId, error: command.error }));
                            break;
                        case "event":
                            self.execute(new CommitEvent({ instanceId: self.context.instanceId, elementId: self.context.originId, error: command.error }));
                            break;
                    }
                    self.emit(new JobFailed({ instanceId: self.context.instanceId, jobId: command.jobId, error: command.error }));
                }
            },
            onJobFailed: ({ event, self }) => {
                self.context.error = event.error;
                self.state = "failed";
            },
            onJobFinished: ({ event, self }) => {
                self.context.result = event.result;
                self.state = "finished";
            }
        },
        failed: {},
        finished: {}
    }
};