/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../../util/constants");
const { v4: uuid } = require("uuid");

const { ActivateNext,
        ActivateBoundary,
        AddContext, 
        ProcessTask } = require("./../commands/commands");
const { TaskActivated,
        JobCreated,
        TaskStarted,
        TaskCompleted,
        TaskFailed } = require("./../events/events");

function getType (element) {
    let type;
    switch(element.type) {
        case Constants.BUSINESS_RULE_TASK:
            type = "ruleTask";
            break;
        case Constants.SERVICE_TASK:
        case Constants.SEND_TASK:
            type = "serviceTask";
            break;
        case Constants.TASK:
        case Constants.RECEIVE_TASK:
        case Constants.USER_TASK:
        case Constants.MANUAL_TASK:
        case Constants.SCRIPT_TASK:
        case Constants.CALL_ACTIVITY:
            type = "simpleTask";
            break;
    };
    return type;
}

module.exports = {
    name: "TaskMachine",
    initialState: "idle",
    init: ({ self, meta }) => {
    },
    states: {
        onActivateElement: async ({ command, self }) => {
            await self.emit(new TaskActivated({ 
                instanceId: command.instanceId, 
                elementId: command.element.id, 
                element: command.element,
                type: getType(command.element),
                scopedContext: command.scopedContext
            }));
            self.execute(new ProcessTask({ instanceId: command.instanceId, elementId: command.element.id }));
        },
        onTaskActivated: ({ event, self }) => {
            self.context.instanceId = event.instanceId;
            self.context.element = event.element;
            self.context.data = event.scopedContext;
            self.type = event.type;
        },
        serviceTask: {
            idle: {
                onProcessTask: async ({ command, self }) => {
                    const job = {
                        instanceId: command.instanceId,
                        jobId: uuid(),
                        version: self.application.getVersion(),
                        originId: self.uid,
                        type: "task",
                        taskDefinition: {
                            type: self.context.element.taskDefinition.type,
                            retries: self.context.element.taskDefinition.retries,
                        },
                        data: self.context.data
                    };
                    self.emit(new JobCreated(job));
                    self.emit(new TaskStarted({ instanceId: self.context.instanceId, elementId: self.context.element.id, jobId: job.jobId }));
                },
                onTaskStarted: async ({ event, self }) => {
                    self.context.jobs = [event.jobId];
                    self.state = "active";
                }
            },
            active: {
                onCommitTask: async ({ command, self }) => {
                    if (!command.error) {
                        for (const output of self.context.element.output) {
                            await self.execute(new AddContext({ 
                                instanceId: self.context.instanceId,
                                elementId: self.context.element.id,
                                key: output.target, 
                                expression: output.source.substr(1), 
                                context: { result: command.result }
                            }));
                        };
                        await self.emit(new TaskCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id, result: command.result }));
                        self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                    } else {
                        await self.emit(new TaskFailed({ instanceId: self.context.instanceId, elementId: self.context.element.id, error: command.error }));
                        self.execute(new ActivateBoundary({ instanceId: self.context.instanceId, elementId: self.context.element.id, type: Constants.ERROR_EVENT, data: command.error }));  
                    }
                },
                onTaskCompleted: async ({ event, self }) => {
                    self.state = "idle";
                },
                onTaskFailed: async ({ event, self }) => {
                    self.state = "idle";
                }
            }
        },
        ruleTask: {
            idle: {
                onProcessTask: async ({ command, self }) => {
                    const job = {
                        instanceId: command.instanceId,
                        jobId: uuid(),
                        version: self.application.getVersion(),
                        originId: self.uid,
                        data: self.context.data
                    };
                    if (self.context.element.taskDefinition) {
                        job.type = "task";
                        job.taskDefinition = {
                            type: self.context.element.taskDefinition.type,
                            retries: self.context.element.taskDefinition.retries,
                        };
                    } else {
                        job.type = "rule";
                        job.calledDecision = {
                            id: self.context.element.calledDecision.id,
                            resultVariable: self.context.element.calledDecision.resultVariable,
                            retries: self.context.element.calledDecision.retries,
                        };
                    }
                    self.emit(new JobCreated(job));
                    self.emit(new TaskStarted({ instanceId: self.context.instanceId, elementId: self.context.element.id, jobId: job.jobId }));
                },
                onTaskStarted: async ({ event, self }) => {
                    self.context.jobs = [event.jobId];
                    self.state = "active";
                }
            },
            active: {
                onCommitTask: async ({ command, self }) => {
                    if (!command.error) {
                        const context = { result: command.result };
                        if (self.context.element.calledDecision?.resultVariable) context[self.context.element.calledDecision.resultVariable] = command.result;  
                        for (const output of self.context.element.output) {
                            await self.execute(new AddContext({ 
                                instanceId: self.context.instanceId,
                                elementId: self.context.element.id,
                                key: output.target, 
                                expression: output.source.substr(1), 
                                context: { result: command.result }
                            }));
                        };
                        self.emit(new TaskCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id, result: command.result }));
                    } else {
                        self.emit(new TaskFailed({ instanceId: self.context.instanceId, elementId: self.context.element.id, error: command.error }));
                    }
                },
                onTaskCompleted: async ({ event, self }) => {
                    self.state = "idle";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            }
        },
        simpleTask: {
            idle: {
                onProcessTask: async ({ command, self }) => {
                    await self.emit(new TaskStarted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                    self.emit(new TaskCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                },
                onTaskStarted: async ({ event, self }) => {
                    self.state = "active";
                }
            },
            active: {
                onTaskCompleted: async ({ event, self }) => {
                    self.state = "idle";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            }
        }
    }
};
