"use strict";

module.exports = {
    name: "JobMachine",
    initialState: "created",
    init: ({ self, meta }) => {
        self.context.data = meta.data;
    },
    states: {
        created: {
            onJobCreated: ({ event, self }) => {
                self.uid = event.jobId;
                self.context.data = event.data;
                self.state = "waiting";
            }
        },
        waiting: {
            onJobFailed: ({ event, self }) => {
                self.context.error = event.error;
                self.state = "failed";
            },
            onJobFinished: ({ event, self }) => {
                self.context.result = event.data;
                self.state = "finished";
            }
        },
        failed: {},
        finished: {}
    }
};