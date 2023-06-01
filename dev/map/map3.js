const map = require("../lib/map");
const util = require("util");

const template = '{\n    "number": order.orderNumber,\n    "status": "new"\n}';

const data = { order: { orderNumber: '123456' } };

let result = map(template, data);
console.log(util.inspect(template, false, 99, true));
console.log(util.inspect(result, false, 99, true));
