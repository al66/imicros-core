"use strict";

const { Constants } = require("../../../../lib/classes/util/constants");
const { v4: uuid } = require("uuid");

const { ActivateNext } = require("./../commands/commands");
const { TaskActivated,
        TaskCompleted } = require("./../events/events");

module.exports = {
    name: "TaskMachine",
    initialState: "idle",
    init: ({ self, meta }) => {
        self.context.element = meta.element;
        self.context.instanceId = meta.instanceId;
        switch(meta.element.type) {
            case Constants.BUSINESS_RULE_TASK:
                self.type = "ruleTask";
                break;
            case Constants.SERVICE_TASK:
                self.type = "serviceTask";
                break;
            case Constants.SEND_TASK:
                self.type = "sendTask";
                break;
            case Constants.TASK:
            case Constants.RECEIVE_TASK:
            case Constants.USER_TASK:
            case Constants.MANUAL_TASK:
            case Constants.SCRIPT_TASK:
            case Constants.CALL_ACTIVITY:
                self.type = "simpleTask";
                break;
        };
    },
    states: {
        serviceTask: {
            idle: {
                onActivateElement: async ({ command, self }) => {
                    //console.log("activate service task", command);
                    const job = {
                        uid: uuid(),
                        version: self.application.getVersion(),
                        eventCompleted: "ServiceTaskCompleted",
                        eventFailed: "ServiceTaskFailed",
                        data: command.scopedContext
                    };
                    //console.log("schedule job", job);
                    self.emit(new TaskActivated({ 
                        instanceId: self.context.instanceId, 
                        elementId: self.context.element.id, 
                        job, 
                        scopedContext: command.scopedContext
                    }));
                },
                onTaskActivated: async ({ event, self }) => {
                    self.context.data = event.scopedContext;
                    if (!self.context.jobs) self.context.jobs = [];
                    self.context.jobs.push(event.job);
                    self.state = "active";
                    self.emit(new TaskCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            },
            active: {
                onTaskCompleted: async ({ event, self }) => {
                    self.state = "idle";
                    self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                }
            }
        },
        simpleTask: {
            idle: {
                onActivateElement: async ({ command, self }) => {
                    self.emit(new TaskActivated({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                },
                onTaskActivated: async ({ event, self }) => {
                    self.state = "active";
                    self.emit(new TaskCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
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
