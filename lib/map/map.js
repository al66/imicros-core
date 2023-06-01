/**
 * @license MIT, imicros.de (c) 2021 Andreas Leinen
 */
"use strict";

const jsonata = require("jsonata");
const { v4: uuid } = require("uuid");


class Map {
    constructor(template,data) {
        this.template = template,
        this.data = JSON.parse(JSON.stringify(data))
    } 

    map() {
        try {
            const expression = jsonata(this.template);
            expression.registerFunction("uuid", () => uuid());
            return expression.evaluate(this.data);
        } catch (e) {
            return { jsonata: { error: e.message, position: e.position, token: e.token, value: e.value, expression: this.template }}
        }
    }

}

// map template with data 
function map(template,data) {
    const instance = new Map(template,data);
    return instance.map();
}

module.exports = {
    Map,
    map
};
