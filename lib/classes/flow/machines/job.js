/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, sendParent } = require('xstate');
const { Constants } = require("../../util/constants");

const JobMachine = {
    id: "job",
    initial: "created",
    context: ({ input }) => ({ 
        element: input.element,
        data: input.data
    }),
    predictableActionArguments: true,
    entry: [
        sendTo(({ system }) => system.get("instance"),({ context }) => ({ type: "log", data: { message: "Job created (M)",  data: { elementId: context.element.id, data: context.data } }}))
    ],
    states: {
        created: {
            on: {
                commit: {
                    target: "done",
                    actions: [
                        assign({ data: ({ event }) => event.data }),
                        // forward commit to task
                        sendTo(({ system, context }) => system.get(context.element.id),({ event }) => event),
                        sendTo(({ system }) => system.get("instance"),(({ self }) => ({ type: "job.completed", data: { jobId: self.id }}))),
                        sendTo(({ system }) => system.get("instance"),({ context, event }) => ({ type: "context.add", data: { output: context.element.output, input: event.data.data } })),
                        sendTo(({ system }) => system.get("instance"),(({ context, event }) => ({ type: "log", data: { message: "Commit received (Job)",  data: { elementId: context.element.id, data: event.data } }})))
                    ]
                },
                failed: {
                    target: "error",
                    actions: [
                        assign({ data: ({ event }) => event.data }),
                        // forward error to task
                        sendTo(({ system, context }) => system.get(context.element.id),({ event }) => event),
                        sendTo(({ system }) => system.get("instance"),(({ self }) => ({ type: "job.failed", data: { jobId: self.id }}))),
                        // sendTo(({ system }) => system.get("instance"),({ context, event }) => ({ type: "context.add", data: { output: context.element.output, input: event.data.data } })),
                        sendTo(({ system }) => system.get("instance"),(({ context, event }) => ({ type: "log", data: { message: "Error received (Job)",  data: { elementId: context.element.id, data: event.data } }})))
                    ]
                }
            }
        },
        error: {
            type: "final"
        },
        done: {
            type: "final"
        }
    }
};

module.exports = {
    JobMachine
};
