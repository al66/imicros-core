/**
 * @license MIT, imicros.de (c) 2024 Andreas Leinen
 */
"use strict";

const { CommandHandler } = require("./../basic/handler");
const { CommitJob } = require("./commands");
const { JobMachine } = require("./../machines/machines");

class CommitJobHandler extends CommandHandler {
    static forCommand () { return CommitJob }

    async execute (command) {
        const instance = await this.application.addModel({ uid: command.jobId, machine: JobMachine });
        if (instance) await instance.dispatch(command);
    }
}

module.exports = CommitJobHandler;