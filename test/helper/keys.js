"use strict";

const { v4: uuid } = require("uuid");

class Keys {
    constructor () {
        this.store = {};
    }
    // for tests only
    addKey({ owner = null } = {}) {
        if (!owner) owner = '#';
        if (!this.store[owner]) this.store[owner] = {};
        const id = uuid();
        this.store[owner][id] = uuid();
        this.store[owner].default = id;
        return id;
    }
    getKey ({ id = null , owner = null} = {})  {
        if (!owner) owner= '#';
        if (!id) id = this.store[owner].default;
        return {
            id,
            key: this.store[owner][id]
        };
    }
}

module.exports = {
    keysMock: new Keys()
};