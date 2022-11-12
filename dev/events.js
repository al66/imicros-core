
class Event {
    constructor(payload) {
        if (payload) {
            for (const [attribute, value] of Object.entries(payload)) this[attribute] = value;
        }
    }
}

class GroupCreated extends Event {
    constructor({ type, name }) {
        super(...arguments);
    }
};

const event = new GroupCreated({ type: "any", name: "my group"});

console.log(event);

