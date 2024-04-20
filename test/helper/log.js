const jestConsole = console;

beforeEach(() => {
    if (process.env.LOG === "console") global.console = require('console');        
});

afterEach(() => {
    if (process.env.LOG === "console") global.console = jestConsole;        
});
