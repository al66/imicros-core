/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { Constants } = require("../../util/constants");

const EventMachine = require("./event");
const SequenceMachine = require("./sequence");
const GatewayMachine = require("./gateway");
const TaskMachine = require("./task");

const { ActivateElement } = require("./../commands/commands");
const { InstanceCreated } = require("./../events/events");
const { ContextAdded } = require("./../events/events");

module.exports = {
    name: "InstanceMachine",
    initialState: "new",
    init: ({ self }) => {
    },
    states: {
        new: {
            onCreateInstance: async ({ command, self }) => {
                await self.emit(new InstanceCreated({ instanceId: command.instanceId, processData: command.processData }));
            },
            onInstanceCreated: ({ event, self }) => {
                self.uid = event.instanceId;
                self.context.processData = event.processData;
                self.context.data = {};
                self.state = "active";
            }
        },
        active: {
            onRaiseEvent: async ({ command, self }) => {
                // search in events - either by localId or messageCode
                let element = self.context.processData.event.find(event => event.localId === command.eventId || event.messageCode === command.eventId);
                if (element) {
                    // add element for machine
                    command.element = element;
                    // raise event
                    const event = self.application.addModel({ uid: element.id, machine: EventMachine, meta: { element, instanceId: self.uid } });
                    await event.dispatch(command);
                }                                                
            },
            onAddContext: async ({ command, self }) => {
                let value = self.application.evaluate({ expression: command.expression, context: command.context });
                if (typeof value === "object") value = JSON.parse(JSON.stringify(value));
                await self.emit(new ContextAdded({ instanceId: self.uid, elementId: command.elementId, key: command.key, value }));
            },
            onActivateNext: ({ command, self }) => {
                if (!command.elementId) {
                    return;
                }
                let next = [];
                // search in sequences
                let element = self.context.processData.sequence.find(sequence => sequence.id === command.elementId);
                // search in tasks
                if (!element) element = self.context.processData.task.find(task => task.id === command.elementId);
                // search in events
                if (!element) element = self.context.processData.event.find(event => event.id === command.elementId);
                // search in gateways
                if (!element) element = self.context.processData.gateway.find(gateway => gateway.id === command.elementId);
                // TODO: sub process, call activity, transaction
        
                // sequence
                if (element.type === Constants.SEQUENCE_STANDARD || element.type === Constants.SEQUENCE_CONDITIONAL ) {
                    if (element.toId) next.push(element.toId);
                // task, event or gateway
                } else {
                    if (Array.isArray(element.outgoing)) next = next.concat(element.outgoing);
                };
        
                // map id to element
                next = next.map(id => {
                    // search in sequences
                    let element = self.context.processData.sequence.find(sequence => sequence.id === id);
                    if (element) {
                        return self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: SequenceMachine, element }));  
                    }
                    // search in tasks
                    element = self.context.processData.task.find(task => task.id === id);
                    if (element) {
                        return self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: TaskMachine, element }));  
                    }
                    // search in events
                    element = self.context.processData.event.find(evnt => evnt.id === id);
                    if (element) {
                        return self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: EventMachine, element }));  
                    }
                    // search in gateways
                    element = self.context.processData.gateway.find(gateway => gateway.id === id);
                    if (element) {
                        return self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: GatewayMachine, element, previous: command.elementId }));  
                        //return self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: { previous: event.data?.elementId } }});    
                    }
                    // TODO: sub process, call activity, transaction
                    return null;
                });

                // no further elements
                // if (next.length === 0) self.send({ type: "check.completed" });                    
            },
            onActivateBoundary: ({ command, self }) => {
                if (!command.elementId) {
                    return;
                }
                // search in events
                const boundaryEvents = self.context.processData.event.filter(event => event.attachedToRef === command.elementId && event.type === command.type);
                const isInterrupting = boundaryEvents.filter(event => event.interrupting).length > 0;
                for (const element of boundaryEvents) {
                    self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: EventMachine, element }));      
                }
                // TODO interrupting
                // if (isInterrupting === true) self.send({ type: "deactivate.element", data: { elementId: event.data.elementId  }});
            },
            onConditionalNext: ({ command, self }) => {   
                // check conditionial sequences -> first valid
                const valid = command.outgoing.filter(id => id !== command.default).find(id => {
                    let element = self.context.processData.sequence.find(sequence => sequence.id === id && sequence.type === Constants.SEQUENCE_CONDITIONAL);
                    if (element) {
                        // test condition
                        let result = self.application.evaluate({ expression: element.expression.expression.substring(1), context: self.context.data });
                        // activate first, which evaluates to true
                        if (result) self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: SequenceMachine, element }));  
                        return result;
                    }
                    return null;
                });
                // no conditional sequence valid -> activate default
                if (!valid && command.default) {
                    let element = self.context.processData.sequence.find(sequence => sequence.id === command.default && sequence.type === Constants.SEQUENCE_STANDARD);   
                    if (element) {
                        self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: SequenceMachine, element }));  
                    }
                }
                // no conditional sequence valid & no default -> activate first standard sequence
                if (!valid && !command.default) {
                    let element = self.context.processData.sequence.find(sequence => sequence.type === Constants.SEQUENCE_STANDARD);
                    if (element) {
                        self.execute(new ActivateElement({ instanceId: self.uid, id: element.id, machine: SequenceMachine, element }));  
                    }
                }
            },
            onActivateElement: ({ command, self }) => {
                // build input
                let scopedContext = {};
                if (command.element.input) {
                    // io mapping with feel expression - first variable w/o name: whole context data is mapped (should be only one)
                    command.element.input.forEach(input => {
                        if (!input.target) scopedContext = self.application.evaluate({ expression: input.source.substr(1), context: self.context.data});
                    });
                    // io mapping with feel expression
                    command.element.input.forEach(input => {
                        if (input.target) scopedContext[input.target] = self.application.evaluate({ expression: input.source.substr(1), context: self.context.data});
                    });
                };
                // output = input
                if (command.element.output && command.element.input.length === 0) {
                    // io mapping with feel expression - first variable w/o name: whole context data is mapped (should be only one)
                    command.element.output.forEach(output => {
                        if (!output.target) scopedContext = self.application.evaluate({ expression: output.source.substr(1), context: self.context.data });
                    });
                    // io mapping with feel expression
                    command.element.output.forEach(output => {
                        if (output.target) scopedContext[output.target] = self.application.evaluate({ expression: output.source.substr(1), context: self.context.data });
                    });
                }
                const event = self.application.addModel({ 
                    uid: command.element.id, 
                    machine: command.machine, 
                    meta: { element: command.element, instanceId: self.uid }
                });
                command.scopedContext = scopedContext;
                event.dispatch(command);
            },
            onContextAdded: ({ event, self }) => {
                // assign value
                if (event.key) self.context.data[event.key] = event.value;
                // merge object
                if (!event.key && typeof event.value === "object") self.context.data = { ...self.context.data, ...event.value };
                // assign value to element id
                if (!event.key && typeof event.value !== "object") self.context.data[event.elementId] = event.value;
            }
        },
        finished: {}
    }
};