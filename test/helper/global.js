
let token = {}

class Shared {

    setToken (key,value) {
        token[key] = value;
    };

    getToken (key) {
        return token[key];
    }

}

global.shared = new Shared();

// module.exports = global;