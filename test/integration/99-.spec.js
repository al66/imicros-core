"use strict";

const { getToken } = require("../helper/shared");

describe("Test token", () => {

    it("it should inherit the tokens from previous test", async () => {
        const token = global.shared.getToken("accessDataAdminGroup");
        console.log(token);
        expect(token).toBeDefined();
    });

});
