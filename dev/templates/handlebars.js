const Handlebars = require("handlebars");
const template = Handlebars.compile("Name: {{name.prename}}");
console.log(template({ name: { prename: "Nils" } }));
const templateSpec = Handlebars.precompile("Name: {{name}}");
console.log(templateSpec);
