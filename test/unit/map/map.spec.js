"use strict";

const { Map } = require("../../../index");

// map template with data 
function map(template,data) {
    const instance = new Map(template,data);
    return instance.map();
}

describe("Test map", () => {

    it("it should return template object",async () => {
        let template = "{ 'key A': 1, 'key B': 'String', 'key C': [1,2,3,4], 'key D': ['1','2','3','4'] }";
        let data = {};
        let result = await map(template,data);
        expect(result).toEqual({
            "key A": 1,
            "key B": "String",
            "key C": [1,2,3,4],
            "key D": ["1","2","3","4"]
        });
    });

    it("it should replace keys",async () => {
        let template = "{ a: 1, 'key ' & b: 'String', keys.c: [1,2,3,4], 'key ' & keys.d: ['1','2','3','4'] }";
        let data = {
            a: "key A",
            b: "B",
            keys: {
                c: "key C",
                d: "D"
            }
        };
        let result = await map(template,data);
        expect(result).toEqual({
            "key A": 1,
            "key B": "String",
            "key C": [1,2,3,4],
            "key D": ["1","2","3","4"]
        });
    });
  
    it("it should replace values",async () => {
        let template = "{ 'key A': number, 'key B': string, 'key C': values.arrays.numbers, 'key D': values.arrays.strings }"
        let data = {
            number: 5,
            string: "hello",
            values: {
                arrays: {
                    numbers: [1,2,3,4],
                    strings: ["1","2","3","4"]
                }
            }
        };
        let result = await map(template,data);
        expect(result).toEqual({
            "key A": 5,
            "key B": "hello",
            "key C": [1,2,3,4],
            "key D": ["1","2","3","4"]
        });
    });
  
    it("it should work with arrays",async () => {
        let template = "[number,string,[values.arrays.numbers],[values.arrays.strings]]";
        let data = {
            number: 5,
            string: "hello",
            values: {
                arrays: {
                    numbers: [1,2,3,4],
                    strings: ["1","2","3","4"]
                }
            }
        };
        let result = await map(template,data);
        expect(result).toEqual([
            5,
            "hello",
            [1,2,3,4],
            ["1","2","3","4"]
        ]);
    });
  
    it("it should return objects",async () => {
        let template = "{ 'key A': values.arrays, 'key B': values.object }";
        let date = Date.now();
        let data = {
            values: {
                arrays: {
                    numbers: [1,2,3,4],
                    strings: ["1","2","3","4"]
                },
                object: {
                    a: {
                        x: 1
                    },
                    b: {
                        y: date
                    }
                }
            }
        };
        let result = await map(template,data);
        expect(result).toEqual({
            "key A": {
                numbers: [1,2,3,4],
                strings: ["1","2","3","4"]
            },
            "key B": {
                a: {
                    x: 1
                },
                b: {
                    y: date
                }
            }
        });
    });

    it("it should return root",async () => {
        const template = "$";
        const data = [
            { "test": 1}, { "test": 2}, { "test": 2}
        ];
        const result = await map(template,data);
        expect(result).toEqual(data)
    });
  
    it("it should return root as subpath",async () => {
        const template = "{ 'root': $ }";
        const data = [
            { "test": 1}, { "test": 2}, { "test": 2}
        ];
        const result = await map(template,data);
        expect(result).toEqual({ root: data })
    });
  
    it("it should return inner object values",async () => {
        const template = "{'test': [$.collection.test] }";
        const data = {
            collection: [{ "test": 1}, { "test": 2}, { "test": 2}]
        };
        const result = await map(template,data);
        //console.log(result);
        expect(result).toEqual({ test: [1,2,2] })
    });

    it("it should modify object",async () => {
        const data = [
            {
                "id": 2,
                "name": "An ice sculpture",
                "price": 12.50,
                "tags": ["cold", "ice"],
                "dimensions": {
                    "length": 7.0,
                    "width": 12.0,
                    "height": 9.5
                },
                "warehouseLocation": {
                    "latitude": -78.75,
                    "longitude": 20.4
                }
            },
            {
                "id": 3,
                "name": "A blue mouse",
                "price": 25.50,
                "dimensions": {
                    "length": 3.1,
                    "width": 1.0,
                    "height": 1.0
                },
                "warehouseLocation": {
                    "latitude": 54.4,
                    "longitude": -32.7
                }
            }
        ]
        const template = "$ ~> | $[id=2] | {'price': $round(price * 1.1,2)} |"
        const expected = [
            {
                "id": 2,
                "name": "An ice sculpture",
                "price": 13.75,
                //"price": 12.50,
                "tags": [
                    "cold",
                    "ice"
                ],
                "dimensions": {
                    "length": 7,
                    "width": 12,
                    "height": 9.5
                },
                "warehouseLocation": {
                    "latitude": -78.75,
                    "longitude": 20.4
                }
            },
            {
                "id": 3,
                "name": "A blue mouse",
                //"price": 25.5,
                "price": 25.5,
                "dimensions": {
                    "length": 3.1,
                    "width": 1,
                    "height": 1
                },
                "warehouseLocation": {
                    "latitude": 54.4,
                    "longitude": -32.7
                }
            }
        ]
        const result = await map(template,data);
        expect(result).toEqual(expected);

    })

    it("it should collect deep nested objects",async () => {
        const data = [{
            "faculty": "humanities",
            "courses": [
                {
                    "course": "English",
                    "students": [
                        {
                            "first": "Mary",
                            "last": "Smith",
                            "email": "mary_smith@gmail.com"
                            },
                        {
                            "first": "Ann",
                            "last": "Jones",
                            "email": "ann_jones@gmail.com"
                        }
                    ]
                },
                {
                    "course": "History",
                    "students": [
                        {
                            "first": "Ann",
                            "last": "Jones",
                            "email": "ann_jones@gmail.com"
                        },
                        {
                            "first": "John",
                            "last": "Taylor",
                            "email": "john_taylor@gmail.com"
                        }
                    ]
                }
            ]
        },
        {
            "faculty": "science",
            "courses": [
                {
                "course": "Physics",
                "students": [{
                        "first": "Anil",
                        "last": "Singh",
                        "email": "anil_singh@gmail.com"
                    },
                    {
                        "first": "Amisha",
                        "last": "Patel",
                        "email": "amisha_patel@gmail.com"
                    }]
                },
                {
                    "course": "Chemistry",
                    "students": [
                    {
                        "first": "John",
                        "last": "Taylor",
                        "email": "john_taylor@gmail.com"
                    },
                    {
                        "first": "Anil",
                        "last": "Singh",
                        "email": "anil_singh@gmail.com"
                    }
                    ]
                }
            ]
        }]
        const template = "$distinct($.courses.students@$s.{'email': $s.email, 'courses': [$$.courses.students[email=$s.email].%.course]})^(email)"
        const expected = [
            {
                "email": "amisha_patel@gmail.com",
                "courses": ["Physics"]
            },
            {
                "email": "anil_singh@gmail.com",
                "courses": [
                    "Physics",
                    "Chemistry"
                ]
            },
            {
                "email": "ann_jones@gmail.com",
                "courses": [
                    "English",
                    "History"
                ]
            },
            {
                "email": "john_taylor@gmail.com",
                "courses": [
                    "History",
                    "Chemistry"
                ]
            },
            {
                "email": "mary_smith@gmail.com",
                "courses": ["English"]
            }
        ]
        const result = await map(template,data);
        //console.log(result);
        expect(result).toEqual(expected);

    })       
});