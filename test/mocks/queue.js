/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 *
 */
"use strict";

const queue = {};

const QueueServiceMock = {
    name: "queue",
    version: 1,

    actions: {
        add: {
            params: {
                topic: { type: "string" },
                key: { type: "string" },
                event: { type: "string" },
                data: { type: "object" }
            },
            async handler(ctx) {
                if (!queue[ctx.params.topic]) queue[ctx.params.topic] = [];
                queue[ctx.params.topic].push(ctx.params);
                return true;
            }
        },
   
        addBatch: {
            params: {
                topicMessages: { type: "array", items: "object", props: {
                    topic: { type: "string" },
                    messages: { type: "array", items: "object", props: {
                        key: { type: "string" },
                        event: { type: "string" },
                        data: { type: "object" }
                    }}
                }}
            },
            async handler(ctx) {
                ctx.params.topicMessages.forEach(topicMessage => {
                    if (!queue[topicMessage.topic]) queue[topicMessage.topic] = [];
                    topicMessage.messages.forEach(message => {
                        queue[topicMessage.topic].push({ topic: topicMessage.topic, ...message });
                    });
                });
                return true;
            }
         }
   
    },

    methods: {},

    /**
     * Service created lifecycle event handler
     */
    async created() {}

}

module.exports = {
    QueueServiceMock,
    queue
}