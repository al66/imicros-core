"use strict";

const { v4: uuid } = require("uuid");

const timestamp = new Date();
const users = [
    {
        uid: uuid(),
        email: `admin${timestamp.valueOf()}@imicros.de`,
        password: "?My::secret!",
        locale: "enUS"
    },{
        uid: uuid(),
        email: `userB${timestamp.valueOf()}@imicros.de`,
        password: "?My:userB:secret!",
        locale: "enUS"
    },{
        uid: uuid(),
        email: `userC${timestamp.valueOf()}@imicros.de`,
        password: "?My:userC:secret!",
        locale: "deDE"
    },{
        uid: uuid(),
        email: `userD${timestamp.valueOf()}@imicros.de`,
        password: "?My:userD:secret!",
        locale: "enUS"
    }
]
const groups = [
    {
        uid: uuid(),
        label: "my first group"
    },
    {
        uid: uuid(),
        label: "second group"
    }
]
const agents = [
    {
        uid: uuid(),
        label: "my first agent"
    }
]

module.exports = {
    timestamp,
    users,
    groups,
    agents
};
