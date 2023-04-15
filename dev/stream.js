
const { Readable } = require("stream");

const readable = Readable.from(["input string"]);
readable.pipe(process.stdout);
