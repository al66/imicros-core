"use strict";

const { InvalidCycle } = require("../../../lib/classes/exceptions/exceptions");
const { Cycle } = require("../../../lib/classes/timer/cycle");

describe("Test timer: cycle", () => {
    
    describe("Test cycle parsing", () => {
        /*
        const tests = [
            "R2/2012-01-01T00:00:00Z/P1Y2D",
            "R/2012-01-01T00:00:00Z/PT3M",
            "R/2012-01-01T00:00:00+02:00/PT3M",
            "R5/2012-01-01/P40D",
            "R5/2012-01-01/P3W2D",
            "R2/2012-01-01T00:00:00Z/P1Y2DT0H3M",
            "2012-01-01T00:00:00Z",
        ];
        
        for (test of tests) {
            try {
                console.log("Test", test);
                let cycle = new Cycle(test);
                console.log("VALUE", cycle.value);
                console.log("START", cycle.next());
                console.log("NEXT", cycle.next(cycle.date));
            } catch(err) {
                console.log("ERROR",err)
            }
        }
        */

        it("it should get next for cycle R2/2024-01-01T00:00:00Z/P1Y2D", async () => {
            const cycle = new Cycle("R2/2024-01-01T00:00:00Z/P1Y2D");
            const next = cycle.next({ current: cycle.date, cycleCount: 0 });
            const expected = new Date("2025-01-03T00:00:00Z");
            expect(next).toEqual(expected);
        });

        it("it should get next for given date with cycle R2/2024-01-01T00:00:00Z/P1Y2D", async () => {
            const cycle = new Cycle("R2/2024-01-01T00:00:00Z/P1Y2D");
            const next = cycle.next({ current: new Date("2025-01-03T00:00:00Z"), cycleCount: 1 });
            const expected = new Date("2026-01-05T00:00:00Z");
            expect(next).toEqual(expected);
        });

        it("it should return null cycle R2/2024-01-01T00:00:00Z/P1Y2D", async () => {
            const cycle = new Cycle("R2/2024-01-01T00:00:00Z/P1Y2D");
            const next = cycle.next({ current: new Date("2026-01-05T00:00:00Z"), cycleCount: 2 });
            expect(next).toEqual(null);
        });

        it("it should return next P1Y2D based on given date", async () => {
            const cycle = new Cycle("P1M2DT1H");
            const next = cycle.next({ current: new Date("2024-02-27T00:05:23Z") });
            const expected = new Date("2024-03-29T01:05:23Z");
            expect(next).toEqual(expected);
        });

    });
});
