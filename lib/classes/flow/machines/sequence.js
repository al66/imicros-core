/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { ActivateNext } = require("./../commands/commands");

const { SequenceActivated,
        SequenceCompleted  } = require("./../events/events");

module.exports = {
    name: "SequenceMachine",
    initialState: "idle",
    init: ({ self, meta }) => {
        self.context.element = meta.element;
        self.context.instanceId = meta.instanceId;
    },
    states: {
        idle: {
            onActivateElement: async ({ command, self }) => {
                await self.emit(new SequenceActivated({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
                self.emit(new SequenceCompleted({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
            },
            onSequenceActivated: async ({ event, self }) => {
                self.state = "active";
            }
        },
        active: {
            onSequenceCompleted: async ({ event, self }) => {
                self.state = "idle";
                self.execute(new ActivateNext({ instanceId: self.context.instanceId, elementId: self.context.element.id }));
            }
        }
    }
};