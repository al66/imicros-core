"use strict";
const { ServiceBroker } = require("moleculer");
const { FeelService } = require("../../../index");

// mocks & helpers
const { StoreMixin } = require("../../mocks/store.mixin");

const fs = require("fs");

describe("Test context service", () => {

    let broker, opts = {};
    beforeAll(() => {
    });
    
    afterAll(async () => {
    });
    
    describe("Test create service", () => {

        it("it should start the broker", async () => {
            broker = new ServiceBroker({
                logger: console,
                logLevel: "info" //"debug"
            });
            broker.createService(Object.assign(FeelService, { 
                mixins: [StoreMixin()]
            }));
            await broker.start();
            expect(broker).toBeDefined();
        });

    });
    
    describe("Test feel ", () => {

        it("it should evaluate a string expression", () => {
            let params = {
                expression: "a+b",
                context: { a: 5, b: 7 }
            };
            return broker.call("feel.evaluate", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual(12);
            });
        });
        
        it("it should evaluate xml", () => {
            const filePath = "./assets/Sample.dmn";
            const xmlData = fs.readFileSync(filePath).toString();
            let params = {
                expression: { xml: xmlData },
                context: {
                    "Credit Score": { FICO: 700 }, 
                    "Applicant Data": { Monthly: { Repayments: 1000, Tax: 1000, Insurance: 100, Expenses: 500, Income: 5000 } },
                    "Requested Product": { Amount: 600000, Rate: 0.0375, Term: 360 }
                }            };
            return broker.call("feel.evaluate", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    'Credit Score': { FICO: 700 },
                    'Applicant Data': {
                      Monthly: {
                        Repayments: 1000,
                        Tax: 1000,
                        Insurance: 100,
                        Expenses: 500,
                        Income: 5000
                      }
                    },
                    'Requested Product': { Amount: 600000, Rate: 0.0375, Term: 360 },
                    'Credit Score Rating': 'Good',
                    'Back End Ratio': 'Sufficient',
                    'Front End Ratio': 'Sufficient',
                    'Loan PreQualification': {
                      Qualification: 'Qualified',
                      Reason: 'The borrower has been successfully prequalified for the requested loan.'
                    }
                });
                // console.log(res);
            });
        });
        
        it("it should evaluate xml from cache", () => {
            const filePath = "./assets/Sample.dmn";
            const xmlData = fs.readFileSync(filePath).toString();
            let params = {
                expression: { xml: xmlData },
                context: {
                    "Credit Score": { FICO: 700 }, 
                    "Applicant Data": { Monthly: { Repayments: 1000, Tax: 1000, Insurance: 100, Expenses: 500, Income: 5000 } },
                    "Requested Product": { Amount: 600000, Rate: 0.0375, Term: 360 }
                }            };
            return broker.call("feel.evaluate", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    'Credit Score': { FICO: 700 },
                    'Applicant Data': {
                      Monthly: {
                        Repayments: 1000,
                        Tax: 1000,
                        Insurance: 100,
                        Expenses: 500,
                        Income: 5000
                      }
                    },
                    'Requested Product': { Amount: 600000, Rate: 0.0375, Term: 360 },
                    'Credit Score Rating': 'Good',
                    'Back End Ratio': 'Sufficient',
                    'Front End Ratio': 'Sufficient',
                    'Loan PreQualification': {
                      Qualification: 'Qualified',
                      Reason: 'The borrower has been successfully prequalified for the requested loan.'
                    }
                });
                // console.log(res);
            });
        });
        
        it("it should convert xml", () => {
            let params = {
                objectName: "Sample.dmn"
            };
            return broker.call("feel.convert", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.result).toEqual(true);
                expect(res.expression).toBeDefined();
                // console.log(res);
            });
        });
        
        it("it should evaluate a stored expression", () => {
            let params = {
                expression: { objectName: "Sample.dmn" },
                context: {
                    "Credit Score": { FICO: 700 }, 
                    "Applicant Data": { Monthly: { Repayments: 1000, Tax: 1000, Insurance: 100, Expenses: 500, Income: 5000 } },
                    "Requested Product": { Amount: 600000, Rate: 0.0375, Term: 360 }
                }
            };
            return broker.call("feel.evaluate", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    'Credit Score': { FICO: 700 },
                    'Applicant Data': {
                      Monthly: {
                        Repayments: 1000,
                        Tax: 1000,
                        Insurance: 100,
                        Expenses: 500,
                        Income: 5000
                      }
                    },
                    'Requested Product': { Amount: 600000, Rate: 0.0375, Term: 360 },
                    'Credit Score Rating': 'Good',
                    'Back End Ratio': 'Sufficient',
                    'Front End Ratio': 'Sufficient',
                    'Loan PreQualification': {
                      Qualification: 'Qualified',
                      Reason: 'The borrower has been successfully prequalified for the requested loan.'
                    }
                });
                // console.log(res);
            });
        });

        it("it should evaluate a stored expression from cache", () => {
            let params = {
                expression: { objectName: "Sample.dmn" },
                context: {
                    "Credit Score": { FICO: 700 }, 
                    "Applicant Data": { Monthly: { Repayments: 1000, Tax: 1000, Insurance: 100, Expenses: 500, Income: 5000 } },
                    "Requested Product": { Amount: 600000, Rate: 0.0375, Term: 360 }
                }
            };
            return broker.call("feel.evaluate", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    'Credit Score': { FICO: 700 },
                    'Applicant Data': {
                      Monthly: {
                        Repayments: 1000,
                        Tax: 1000,
                        Insurance: 100,
                        Expenses: 500,
                        Income: 5000
                      }
                    },
                    'Requested Product': { Amount: 600000, Rate: 0.0375, Term: 360 },
                    'Credit Score Rating': 'Good',
                    'Back End Ratio': 'Sufficient',
                    'Front End Ratio': 'Sufficient',
                    'Loan PreQualification': {
                      Qualification: 'Qualified',
                      Reason: 'The borrower has been successfully prequalified for the requested loan.'
                    }
                });
                // console.log(res);
            });
        });
        
        it("it should remove object from cache", () => {
            let params = {
                objectName: "Sample.dmn"
            };
            return broker.call("feel.clearFromCache", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.done).toEqual(true);
            });
        });
        
        it("it should rebuild the stored expression, as the cache is cleared", () => {
            let params = {
                expression: { objectName: "Sample.dmn" },
                context: {
                    "Credit Score": { FICO: 700 }, 
                    "Applicant Data": { Monthly: { Repayments: 1000, Tax: 1000, Insurance: 100, Expenses: 500, Income: 5000 } },
                    "Requested Product": { Amount: 600000, Rate: 0.0375, Term: 360 }
                }
            };
            return broker.call("feel.evaluate", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res).toEqual({
                    'Credit Score': { FICO: 700 },
                    'Applicant Data': {
                      Monthly: {
                        Repayments: 1000,
                        Tax: 1000,
                        Insurance: 100,
                        Expenses: 500,
                        Income: 5000
                      }
                    },
                    'Requested Product': { Amount: 600000, Rate: 0.0375, Term: 360 },
                    'Credit Score Rating': 'Good',
                    'Back End Ratio': 'Sufficient',
                    'Front End Ratio': 'Sufficient',
                    'Loan PreQualification': {
                      Qualification: 'Qualified',
                      Reason: 'The borrower has been successfully prequalified for the requested loan.'
                    }
                });
                // console.log(res);
            });
        });

        it("it should parse and check a string expression", () => {
            let params = {
                expression: "a+b"
            };
            return broker.call("feel.check", params, opts).then(res => {
                expect(res).toBeDefined();
                expect(res.result).toEqual(true);
            });
        });
        
        it("it should fail parsing a string expression", () => {
            let params = {
                expression: "a + b - :c"  // unvalid expression
            };
            return broker.call("feel.check", params, opts).then(res => {
                expect(res).toBeDefined();
                // console.log(res);
                expect(res.result).toEqual(false);
                expect(res.error).toBeDefined();
            });
        });
        
        
    });
 
    describe("Test stop broker", () => {
        it("should stop the broker", async () => {
            expect.assertions(1);
            await broker.stop();
            expect(broker).toBeDefined();
        });
    });
    
});