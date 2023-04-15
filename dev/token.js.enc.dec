const jwt = require("jsonwebtoken");

let privateKey = "Any key";
let keyid = "1234";
//let token = jwt.sign({ foo: "bar" }, privateKey, { algorithm: "HS256"});
// let token = jwt.sign({ foo: "bar", kid: keyid }, privateKey, { header: { keyid }, jwtid: keyid });
let token = jwt.sign({ foo: "bar" }, privateKey, { keyid 
});

let decoded = jwt.decode(token,{ complete: true });
console.log(decoded);

decoded = jwt.verify(token, privateKey);
console.log(decoded);