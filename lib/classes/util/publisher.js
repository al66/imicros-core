/**
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
"use strict";

class Publisher {
    constructor ({ broker }) {
        this.broker = broker;
    }

    async emit (events) {
        for (const event of events) {
            await this.broker.emit(event.constructor.name, event, ["users","groups","agents","admin"]);
            // console.log(event);
        }
    }
}

module.exports = {
    Publisher
}