/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { setup, createMachine, createActor, fromPromise, assign, sendTo, raise, spawn, spawnChild, stopChild, enqueueActions } = require('xstate');
const { Constants } = require("../util/constants");
const { getElementMachine } = require("./machine"); 

const { Interpreter } = require("imicros-feel-interpreter");
const feel = new Interpreter();

const { v4: uuid } = require("uuid");

const InstanceMachine = {
    id: "instance",
    initial: 'created',
    context: ({ }) => ({ 
        data: {},
        childs: {},
        jobs: [],
        events: [],
        log: []
    }),
    predictableActionArguments: true,
    entry: [
    ],
    states: {
        created: { 
            after: { 
                5000: {
                    target: 'stopped',
                    actions: [
                        raise({ type: "log", data: { message: "Instance timeout", data: { currentStatus: "created" } }})/*,
                        assign(({ context }) => { return { childs: {} }}) */
                    ]
                }
            },
            on: { 
                load: {
                    target: 'running',
                    actions: [
                        assign({ processData: ({ event }) => event.processData }),
                        assign({ processId: ({ event }) => event.processData.process.id }),
                        assign({ versionId: ({ event }) => event.processData.version.id }),
                        assign({ instanceId: ({ event }) => event.instanceId })
                    ]
                }
            }
        },
        running: { 
            after: { 
                5000: {
                    target: 'stopped',
                    actions: [
                        raise({ type: "log", data: { message: "Instance timeout", data: { currentStatus: "running" } }})/*,
                        assign(({ context }) => { return { childs: {} }})*/
                    ]
                }
            },
            on: {
                stop: {
                    target: 'stopped',
                    actions: [
                        raise(({ event }) => ({ type: "log", data: { message: "Instance stopped", data: { currentStatus: "running", reason: event.data.reason } }}))
                    ] 
                },
                complete: {
                    target: 'completed',
                    actions: [
                        raise({ type: "log", data: { message: "Instance completed", data: { currentStatus: "running" } }})
                    ] 
                }
            }
        },
        stopped: { 
            on: {
                continue: {
                    target: 'running',
                    actions: [
                        raise({ type: "log", data: { message: "Instance continued", data: { currentStatus: "stopped" } }})
                    ]
                },
                complete: {
                    target: 'completed',
                    actions: [
                        raise({ type: "log", data: { message: "Instance completed", data: { currentStatus: "stopped" } }})
                    ] 
                }
            }
         },
        completed: { 
            type: "final" 
        }
    },
    on: {
        "raise.event": {
            actions: [
                ({context, event, self}) => {
                    // search in events
                    let element = context.processData.event.find(evnt => evnt.name === event.data.eventName || evnt.localId === event.data.eventName);
                    if (element) {
                        self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: event.data.payload, command: "raise" }});
                    }                                                
                }
            ]
        },
        "activate.default": {
            actions: [
                ({context, self}) => {
                    // search in events
                    let element = context.processData.event.find(event => event.position === Constants.START_EVENT && event.type === Constants.DEFAULT_EVENT);
                    if (element) {
                        self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: {} }});
                    }                                                
                }
            ]
        },
        "activate.next": {
            actions: [
                // get next element
                ({context, event, self}) => {
                    if (!event.data?.elementId) {
                        return;
                    }
                    let next = [];
                    // search in sequences
                    let element = context.processData.sequence.find(sequence => sequence.id === event.data.elementId);
                    // search in tasks
                    if (!element) element = context.processData.task.find(task => task.id === event.data.elementId);
                    // search in events
                    if (!element) element = context.processData.event.find(evnt => evnt.id === event.data.elementId);
                    // search in gateways
                    if (!element) element = context.processData.gateway.find(gateway => gateway.id === event.data.elementId);
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
                        let element = context.processData.sequence.find(sequence => sequence.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: {} }});  
                        }
                        // search in tasks
                        element = context.processData.task.find(task => task.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: {} }});    
                        }
                        // search in events
                        element = context.processData.event.find(evnt => evnt.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: {} }});    
                        }
                        // search in gateways
                        element = context.processData.gateway.find(gateway => gateway.id === id);
                        if (element) {
                            return self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: { previous: event.data?.elementId } }});    
                        }
                        // TODO: sub process, call activity, transaction
                        return null;
                    });

                    // no further elements
                    if (next.length === 0) self.send({ type: "check.completed" });
                },
                raise(({ event }) => ({ type: "deactivate.element", data: { elementId: event.data.elementId  }}))
            ]
        },
        "activate.boundary": {
            actions: [
                // get next element
                ({context, event, self}) => {
                    if (!event.data?.elementId) {
                        return;
                    }
                    let next = [];
                    // search in events
                    const element = context.processData.event.find(evnt => evnt.attachedToRef === event.data.elementId);
                    const interrupting = element?.interrupting;
                    if (element ) self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: event.data.data, command: "raise" }});    
                    if (interrupting === true) self.send({ type: "deactivate.element", data: { elementId: event.data.elementId  }});
                }
            ]
        },
        "conditional.next": {
            actions: [
                ({context, event, self}) => {
                    // check conditionial sequences -> first valid
                    const valid = event.data.outgoing.filter(id => id !== event.data.default).find(id => {
                        let element = context.processData.sequence.find(sequence => sequence.id === id && sequence.type === Constants.SEQUENCE_CONDITIONAL);
                        if (element) {
                            // test condition
                            let result = feel.evaluate(element.expression.expression.substring(1),context.data);
                            // activate first, which evaluates to true
                            if (result) {
                                self.send({ type: "log", data: { message: "Conditional sequence taken", data: { elementId: element.id, expression: element.expression.expression.substring(1) } }});
                                self.send({ type: "activate.element", data: { id: element.id, machine: getElementMachine(element), element, data: {} }});
                            } else {
                                self.send({ type: "log", data: { message: "Conditional sequence dropped", data: { elementId: element.id, expression: element.expression.expression.substring(1) } }});
                            }
                            return result;
                        }
                        return null;
                    });
                    // no conditional sequence valid -> activate default
                    if (!valid && event.data.default) {
                        let element = context.processData.sequence.find(sequence => sequence.id === event.data.default && sequence.type === Constants.SEQUENCE_STANDARD);   
                        if (element) {
                            self.send({ type: "log", data: { message: "Default sequence taken", data: { elementId: element.id } }});
                            self.send({ type: "activate.element", data: { id: event.data.default, machine: getElementMachine(element), element , data: {} }});
                        }
                    }
                    // no conditional sequence valid & no default -> activate first standard sequence
                    if (!valid && !event.data.default) {
                        let element = context.processData.sequence.find(sequence => sequence.type === Constants.SEQUENCE_STANDARD);
                        if (element) {
                            self.send({ type: "log", data: { message: "First standard sequence taken", data: { elementId: element.id } }});
                            self.send({ type: "activate.element", data: { id: event.data.default, machine: getElementMachine(element), element , data: {} }});
                        }
                    }
                    self.send({ type: "deactivate.element", data: { elementId: event.data.elementId  }});
                }
            ]
        },
        "activate.element": {
            actions: [
                assign(({context, spawn, event, self}) => {
                    // already created -> nothing toDo
                    if (context.childs && context.childs[event.data.id]) {
                        return { }
                    };
                    // context - in case of raised events based on the payload
                    // build input
                    let scopedContext = {};
                    if (event.data.command !== "raise") {
                        if (event.data.element.input) {
                            // io mapping with feel expression - first variable w/o name: whole context data is mapped (should be only one)
                            event.data.element.input.forEach(input => {
                                if (!input.target) scopedContext = feel.evaluate(input.source.substr(1),context.data);
                            });
                            // io mapping with feel expression
                            event.data.element.input.forEach(input => {
                                if (input.target) scopedContext[input.target] = feel.evaluate(input.source.substr(1),context.data);
                            });
                        };
                        // output = input
                        if (event.data.element.output && event.data.element.input.length === 0) {
                            // io mapping with feel expression - first variable w/o name: whole context data is mapped (should be only one)
                            event.data.element.output.forEach(output => {
                                if (!output.target) scopedContext = feel.evaluate(output.source.substr(1),context.data);
                            });
                            // io mapping with feel expression
                            event.data.element.output.forEach(output => {
                                if (output.target) scopedContext[output.target] = feel.evaluate(output.source.substr(1),context.data);
                            });
                        }
                    }
                    const machine = createMachine(event.data.machine, { inspect: self.inspect });
                    spawn(machine, { id: event.data.id, systemId: event.data.id, input: { element: event.data.element, instanceId: self.id, scopedContext } });
                    // hack - spawn is only passed to assign
                    return { }            
                }),                
                assign(({ context, event }) => {
                    context.childs[event.data.id] = event.data.id;
                    return { childs: context.childs }
                }),
                raise(({ event }) => ({ type: "log", data: { message: "Element activated",  data: { elementId: event.data.id  } }})),
                sendTo(({ event }) => event.data.id, ({ event }) => ({ type: event.data.command ? event.data.command : "activate", data: event.data.data }))
            ]
        },
        "deactivate.element": {
            actions: [
                stopChild(({event}) => event.data.elementId),
                assign(({ context, event} ) => delete context.childs[event.data.elementId]),
                raise(({ event }) => ({ type: "log", data: { message: "Element deactivated",  data: { elementId: event.data.elementId  } }}))
            ]
        },
        "context.add": {
            actions: [
                assign(({ context, event, self }) => { 
                    if (event.data.output) {
                        // io mapping with feel expression
                        event.data.output.forEach(output => {
                            const key = output.target;
                            const value = feel.evaluate(output.source.substr(1),event.data?.input || context.data);
                            self.send({ type: "context.added", catgeory: "event", data: { key, value}});
                            self.send({ type: "log", data: { message: "Context added",  data: { key, value } }})
                        });
                    };
                })
            ]
        },
        "context.added": {
            actions: [
                assign(({ context, event }) => { 
                    context.data[event.data.key] = event.data.value;
                })
            ]
        },
        "event.occured": {
            actions: [
                assign(({ context, event }) => {
                    context.events.push(event.data);
                    return { events: context.events }
                }),
                raise(({ event }) => ({ type: "log", data: { message: "Event occured (Instance)",  data: { eventName: event.data.name, payload: event.data.payload }}}))
            ]
        },
        "evaluate.decision": {
            actions: [
                assign(({ context, event }) => {
                    const decision = event.data;
                    context.decisions ? context.decisions.push(decision) : context.decisions = [decision];
                    return { decisions: context.decisions }
                })
            ]
        },
        "decision.evaluated": {
            actions: [
                raise(({ context, event, self }) => ({ type: "log", data: { message: "Decision result received (Instance)",  data: { id: event.data?.id } }})),
                ({ system, event }) => {
                     // forward result to task, if still exists
                     const businessRuleTask = system.get(event.data.id);
                     if (businessRuleTask) businessRuleTask.send(event);
                }
             ]
         },
        "job.scheduled": {
            actions: [
                assign(({ context, event }) => {
                    const job = event.data;
                    context.jobs ? context.jobs.push(job) : context.jobs = [job];
                    return { jobs: context.jobs }
                }),
                raise(({ event }) => ({ type: "log", data: { message: "Job scheduled (Instance)",  data: event.data }})),
                raise({ type: "check.idle"})
            ]
        },
        "job.completed": {
            actions: [
                assign(({ context, event }) => {
                    const jobId = event.data?.jobId;
                    if (context.jobs) context.jobs = context.jobs.filter(job => job.jobId !== jobId);
                    return { jobs: context.jobs }
                }),
                raise(({ event }) => ({ type: "log", data: { message: "Job completed (Instance)",  data: { jobId: event.data.jobId }}})),
                raise({ type: "check.idle"})
            ]
        },
        "job.failed": {
            actions: [
                assign(({ context, event }) => {
                    const jobId = event.data?.jobId;
                    if (context.jobs) context.jobs = context.jobs.filter(job => job.jobId !== jobId);
                    return { jobs: context.jobs }
                }),
                raise(({ event }) => ({ type: "log", data: { message: "Job failed (Instance)",  data: { jobId: event.data.jobId }}})),
                raise({ type: "check.idle"})
            ]
        },
        "check.idle": {
            actions: [
                ({context, system, self}) => {
                    let idle = true;
                    for (let child in context.childs) {
                        system.get(child)?.getSnapshot().value !== "waiting" ? idle = false : null;
                    }
                    if (idle) self.send({ type: "stop", data: { reason: "idle" } });
                }
            ]
        },
        "check.completed": {
            actions: [
                ({context, self}) => {
                    if (Object.keys(context.childs).length === 0) {
                        self.send({ type: "complete" });
                    }
                }
            ]   
        },
        "commit": {
            actions: [
               raise(({ context, event, self }) => ({ type: "log", data: { message: "Commit received (Instance)",  data: { id: event.data?.id } }})),
               ({ system, event }) => {
                    // forward commit to job, if still exists
                    const job = system.get(event.data.id);
                    if (job) job.send(event);
               }
            ]
        },
        "failed": {
            actions: [
               raise(({ context, event, self }) => ({ type: "log", data: { message: "Job error received (Instance)",  data: { id: event.data?.id } }})),
               ({ system, event }) => {
                    // forward commit to job, if still exists
                    const job = system.get(event.data.id);
                    if (job) job.send(event);
               }
            ]
        },
        "log": {
            actions: [
                assign(({ context, event }) => {
                    context.log.push(event.data);
                    return { log: context.log }
                })
            ]
        }
    }
};

module.exports = {
    InstanceMachine
};