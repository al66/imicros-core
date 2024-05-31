/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

const { XMLParser } = require("fast-xml-parser");
const { v4: uuid } = require("uuid");

const { Constants } = require("../util/constants");
const { Serializer } = require("../util/serializer");

class Parser {
  
    constructor ({ logger, options = {}}) {
         
        // Moleculer logger
        this.logger = logger;
 
        // serializer
        this.serializer = new Serializer();
 
        // xml parser setup
        const parserOptions = {
           attributeNamePrefix : "_",
           removeNSPrefix: true,
           ignoreAttributes : false,
           ignoreNameSpace : false,
           allowBooleanAttributes : true,
           parseNodeValue : true,
           parseAttributeValue : true,
           trimValues: true,
           cdataTagName: "__cdata", //default is 'false'
           cdataPropName: "__cdata", //default is 'false'
           cdataPositionChar: "\\c",
           parseTrueNumberOnly: false
           //    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
           //    tagValueProcessor : (val, tagName) => he.decode(val), //default is a=>a
           // stopNodes: ["definitions.BPMNDiagram"]
        }
        this.parser = new XMLParser(parserOptions);
 
        // id map
        this.idMap = {};

    }

    toArray( value ) {
        return Array.isArray(value) ? value : ( value ? [value] : [] );
    }

    toJson({ xmlData }) {
        let json = this.parser.parse(xmlData); 
        if (json.definitions.BPMNDiagram) delete json.definitions.BPMNDiagram;
        return json;
    }

    mapId(extern) {
        if (!extern) return null;
        if (!this.idMap[extern]) this.idMap[extern] = uuid();
        return this.idMap[extern];
    }

    parseMassages(messages) {
        this.messages = {};
        if (!messages) return;
        messages.forEach(message => {
            this.messages[message._id] = {
                code: message._name,
                correlation: message.extensionElements?.subscription?._correlationKey || null,
            };
        });
    };

    parsePreparation({ from, to }) {
        if (from) {
            to.preparation = {
                input: [],
                template: {
                    language: 'JSONata',
                    body: from['#text']
                }
            };
            this.toArray(from.context).forEach((io) => {
                to.preparation.input.push(io._key);
            });
        }
    }

    parseExpression({ from, to }) {
        if (from) {
            to.expression = {
                language: from._language,
                body: from['#text']
            }
        }
    }

    parseTaskDefintion({ from, to }) {
        if (from.extensionElements?.taskDefinition) {
            to.taskDefinition = {
                type: from.extensionElements.taskDefinition._type,
                retries: from.extensionElements.taskDefinition._retries || 0
            }
        }
    }        

    parseMessageDefintion({ from, to }) {
        if (from.messageEventDefinition) {
            to.messageCode = this.messages[from.messageEventDefinition._messageRef]?.code || null;
            to.correlation = this.messages[from.messageEventDefinition._messageRef]?.correlation || null;
            //to.correlationExpression = this.toArray(from.extensionElements?.properties?.property).find(p => p._name === "Correlation")?._value || null;
        }
    }

    parseInput({ from, to }) {
        this.toArray(from.extensionElements?.ioMapping?.input).forEach((inp) => {
            let input = {
                source: inp._source.replace(/(&#10;)/g, ''),       // remove line breaks from feel expression
                target: inp._target
            };
            to.input.push(input);
        });
    }

    parseOutput({ from, to }) {
        this.toArray(from.extensionElements?.ioMapping?.output).forEach((out) => {
            let output = {
                source: out._source.replace(/(&#10;)/g, ''),
                target: out._target
            };
            to.output.push(output);
        });
    }

    parseTimer({ from = {}, to }) {
        if (from.timeCycle) {
            to.timer = {
                type: Constants.TIMER_CYCLE,
                expression: from.timeCycle['#text']
            }
        }
        if (from.timeDuration) {
            to.timer = {
                type: Constants.TIMER_DURATION,
                expression: from.timeDuration['#text']
            }
        }
        if (from.timeDate) {
            to.timer = {
                type: Constants.TIMER_DATE,
                expression: from.timeDate['#text']
            }
        }
    }

    parseDefault({ from, to }) {
        if (from) {
            to.default = this.mapId(from)
        }
    }

    parseSignalType({ from, to }) {
        if (from?.signalEventDefinition) {
            to.type = Constants.SIGNAL_EVENT
        }
        if (from?.timerEventDefinition) {
            to.type = Constants.TIMER_EVENT
        }
        if (from?.messageEventDefinition) {
            to.type = Constants.MESSAGE_EVENT
        }
        if (from?.errorEventDefinition) {
            to.type = Constants.ERROR_EVENT
        }
        if (from?.escalationEventDefinition) {
            to.type = Constants.ESCALATION_EVENT
        }
    }

    parseSequences({ from, to, subprocess }) {
        if (from) {
            if (!to.sequence) to.sequence = [];
            this.toArray(from.sequenceFlow).forEach((e) => {
                let sequence = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    fromId: this.mapId(e._sourceRef),
                    toId: this.mapId(e._targetRef),
                    type: e.conditionExpression ? Constants.SEQUENCE_CONDITIONAL : Constants.SEQUENCE_STANDARD,
                    attributes: {}
                };
                if (e.conditionExpression) {
                    sequence.expression = {
                        type: e.conditionExpression._type,
                        expression: e.conditionExpression['#text']
                    }
                }
                to.sequence.push(sequence);
            });
        }
    }

    parseGateways({ from, to, subprocess}) {
        if (!to.gateway) to.gateway = [];
        if (from) {
            // Parse parallel gateways
            this.toArray(from.parallelGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.PARALLEL_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });

            // Parse inclusive gateways
            this.toArray(from.inclusiveGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.INCLUSIVE_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });

            // Parse exclusive gateways
            this.toArray(from.exclusiveGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.EXCLUSIVE_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });

            // Parse event based gateways
            this.toArray(from.eventBasedGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.EVENT_BASED_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });
            
            // Parse complex gateways
            this.toArray(from.complexGateway).forEach((e) => {
                let gateway = {
                    id: this.mapId(e._id),
                    name: e._name,
                    subprocess,
                    type: Constants.COMPLEX_GATEWAY,
                    incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                    outgoing: this.toArray(e.outgoing).map(id => this.mapId(id))
                }
                this.parseDefault({ from: e._default, to: gateway });
                to.gateway.push(gateway);
            });
        }
    }

    parseTasks({ from, to, subprocess }) {
        if (!to.task) to.task = [];
        // Parse business rule tasks
        this.toArray(from.businessRuleTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.BUSINESS_RULE_TASK,
                input: [],
                output: [],
                calledDecision: {
                    id: e.extensionElements?.calledDecision._decisionId,
                    resultVariable: e.extensionElements.calledDecision._resultVariable,
                    retries: e.extensionElements?.calledDecision.retries
                },
                attributes: {
                    input: [],
                    output: ''
                }
            };
            this.parseDefault({ from: e._default, to: task });
            if(e.extensionElements?.businessRuleTask?.object) {
                task.attributes.object = {
                    objectName: e.extensionElements.businessRuleTask.object._objectName,
                    embedded: e.extensionElements.businessRuleTask.object._embedded || false   
                }
            }
            this.toArray(e.extensionElements?.businessRuleTask?.context).forEach((io) => {
                if (io._io === 'in') task.attributes.input.push(io._key);
                if (io._io === 'out') task.attributes.output = io._key;
            });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse service tasks
        this.toArray(from.serviceTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.SERVICE_TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parsePreparation({ from: e.extensionElements?.serviceTask?.preparation, to: task.attributes });
            this.toArray(e.extensionElements?.serviceTask?.context).forEach((io) => {
                if (io._io === 'in') task.attributes.input = io._key;
                if (io._io === 'out') task.attributes.output = io._key;
            });
            if (e.extensionElements?.serviceTask?._action) {
                task.attributes.action = e.extensionElements?.serviceTask?._action
            }
            if (e.extensionElements?.taskDefinition) {
                task.taskDefinition = {
                    type: e.extensionElements.taskDefinition._type,
                    retries: e.extensionElements.taskDefinition._retries
                }
            }
            if (e.extensionElements?.serviceTask?._serviceId) {
                task.attributes.serviceId = e.extensionElements?.serviceTask?._serviceId
            }
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse send task
        this.toArray(from.sendTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.SEND_TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parsePreparation({ from: e.extensionElements?.sendTask?.preparation, to: task.attributes });
            if (e.extensionElements?.taskDefinition) {
                task.taskDefinition = {
                    type: e.extensionElements.taskDefinition._type,
                    retries: e.extensionElements.taskDefinition._retries
                }
            }
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse receive task
        this.toArray(from.receiveTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.RECEIVE_TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse script task
        this.toArray(from.scriptTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.SCRIPT_TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse call activity
        this.toArray(from.callActivity).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.CALL_ACTIVITY,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse user tasks
        this.toArray(from.userTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.USER_TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse manual tasks
        this.toArray(from.manualTask).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.MANUAL_TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

        // Parse tasks
        this.toArray(from.task).forEach((e) => {
            let task = {
                id: this.mapId(e._id),
                name: e._name,
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                type: Constants.TASK,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseDefault({ from: e._default, to: task });
            this.parseInput({ from: e, to: task });
            this.parseOutput({ from: e, to: task });
            to.task.push(task);
        });

    }

    parseEvents({ from, to, subprocess }) {
        // Parse start events
        this.toArray(from.startEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                localId: e._id,
                name: e._name || "",
                subprocess,
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.START_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.CATCHING_EVENT,
                input: [],
                output: [],
                attributes: {}
            };
            this.parseMessageDefintion({ from: e, to: event });
            this.parseSignalType({ from: e, to: event });
            this.parseExpression({ from: e.extensionElements?.startEvent?.expression, to: event.attributes });
            this.parseTimer({ from: e.timerEventDefinition, to: event });
            this.toArray(e.extensionElements?.startEvent?.context).forEach((io) => {
                if (io._io === 'out') event.attributes.output = io._key;
            });
            this.parseInput({ from: e, to: event });
            this.parseOutput({ from: e, to: event });
            to.event.push(event);
        });

        // Parse intermediate throwing events
        this.toArray(from.intermediateThrowEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                localId: e._id,
                name: e._name || "",
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.INTERMEDIATE_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.THROWING_EVENT,
                input: [],
                output: [],
                attributes: {
                    name: e.extensionElements?.intermediateEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parsePreparation({ from: e.extensionElements?.intermediateEvent?.preparation, to: event.attributes });
            this.toArray(e.extensionElements?.intermediateEvent?.context).forEach((io) => {
                if (io._io === 'out') event.attributes.output = io._key;
            });
            this.parseTaskDefintion({ from: e, to: event });
            this.parseInput({ from: e, to: event });
            this.parseOutput({ from: e, to: event });
            to.event.push(event);
        });

        // Parse intermediate catching events
        this.toArray(from.intermediateCatchEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                localId: e._id,
                name: e._name || "",
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.INTERMEDIATE_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.CATCHING_EVENT,
                input: [],
                output: [],
                attributes: {
                    name: e.extensionElements?.intermediateEvent?._eventName || null
                }
            };
            this.parseMessageDefintion({ from: e, to: event });
            this.parseSignalType({ from: e, to: event });
            this.parseTimer({ from: e.timerEventDefinition, to: event });
            this.parseInput({ from: e, to: event });
            this.parseOutput({ from: e, to: event });
            to.event.push(event);
        });

        // Parse boundary events
        this.toArray(from.boundaryEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                localId: e._id,
                name: e._name || "",
                subprocess,
                outgoing: this.toArray(e.outgoing).map(id => this.mapId(id)),
                position: Constants.BOUNDARY_EVENT,
                type: Constants.BOUNDARY_EVENT,
                direction: Constants.CATCHING_EVENT,
                interrupting: e._cancelActivity === "false" || e._cancelActivity === false ? false : true,       
                attachedToRef: this.mapId(e._attachedToRef),
                input: [],
                output: [],
                attributes: {
                    name: e.extensionElements?.intermediateEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parseTimer({ from: e.timerEventDefinition, to: event });
            this.parseOutput({ from: e, to: event });
            to.event.push(event);
        });

        // Parse end events
        this.toArray(from.endEvent).forEach((e) => {
            let event = {
                id: this.mapId(e._id),
                localId: e._id,
                name: e._name || "",
                subprocess,
                incoming: this.toArray(e.incoming).map(id => this.mapId(id)),
                position: Constants.END_EVENT,
                type: Constants.DEFAULT_EVENT,
                direction: Constants.THROWING_EVENT,
                input: [],
                output: [],
                attributes: {
                    name: e.extensionElements?.endEvent?._eventName || null
                }
            };
            this.parseSignalType({ from: e, to: event });
            this.parsePreparation({ from: e.extensionElements?.endEvent?.preparation, to: event.attributes });
            this.toArray(e.extensionElements?.endEvent?.context).forEach((io) => {
                if (io._io === 'out') event.attributes.output = io._key;
            });
            this.parseTaskDefintion({ from: e, to: event });
            this.parseInput({ from: e, to: event });
            this.parseOutput({ from: e, to: event });
            to.event.push(event);
        });
    }

    parse({ id, xmlData, objectName, ownerId, core }) {
        let jsonObj = this.toJson({ xmlData });
        
        if (!jsonObj.definitions) return { failed: true, err: "unvalid definition - missing element bpmn:definitions"};
      
        this.parseMassages(this.toArray(jsonObj.definitions.message));

        let platform;
        switch (jsonObj.definitions._executionPlatform) {
            case "Camunda Cloud":
                platform = Constants.PLATFORM_CAMUNDA;
                break;
            default:
                platform = Constants.PLATFORM_FLOW;
        }

        let parsedProcess = {
            event: []
        };

        const collaborationId = this.mapId(jsonObj.definitions?.collaboration?._id ?? null);
        const version = {
            id: uuid(),
            created: Date.now()
        }

        // collaboration may contain multiple processes
        this.toArray(jsonObj.definitions?.process).filter(p => p._isExecutable === true).forEach(bpmnProcess => {

            // Parse process attributes
            parsedProcess.process = {
                localId: jsonObj.definitions?.collaboration?._id || bpmnProcess._id,
                id: id || collaborationId || this.mapId(bpmnProcess._id ?? null),
                objectName: objectName,
                ownerId: ownerId,
                platform,
                core                              // core group may listen to all events
            };
            parsedProcess.version = version;

            // Parse sequences
            this.parseSequences({ from: bpmnProcess, to: parsedProcess });

            // Parse tasks
            this.parseTasks({ from: bpmnProcess, to: parsedProcess });

            // Parse events
            this.parseEvents({ from: bpmnProcess, to: parsedProcess });

            // parse gateways
            this.parseGateways({ from: bpmnProcess, to: parsedProcess });

            parsedProcess.idMap = this.idMap;
        });
        
        return parsedProcess;
    }
};
 
 module.exports = {
     Parser
 };
 