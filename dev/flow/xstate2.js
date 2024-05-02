"use strict";

const { createMachine, createActor } = require('xstate');
const { v4: uuid } = require("uuid");

const { ParentMachine } = require("./parent");

const parentMachine = createMachine(ParentMachine);
const parent = createActor(parentMachine, { id: "parent", systemId: "parent" });
const childId = uuid();

console.log("Child Id", childId);
parent.start();
parent.send({ type: "start", childId });
parent.send({ type: "tick", id: childId });
const snapshot = parent.getPersistedSnapshot();
parent.stop();

console.log("Snapshot", snapshot);
const restored = JSON.parse(JSON.stringify(snapshot));
//const restored = snapshot;
console.log("Snapshot", restored);

const parentRestored = createActor(parentMachine, { id: "parent", systemId: "parent", snapshot: restored });
parentRestored.start();
parentRestored.send({ type: "tick", id: childId });
parentRestored.send({ type: "stop" });