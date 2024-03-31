const payload = { 
    id: "123", 
    customer: {
        id: "9959", 
        name: "John Doe",
        email: "john.dow@people.com"
    },
    items:[{ 
        pos: "010", 
        matnr: "abc123",
        quantity: 1,
        price: 100.00,
        currency: "EUR",
        description: "Product 1",
    },{ 
        pos: "010", 
        matnr: "abc123",
        quantity: 1,
        price: 100.00,
        currency: "EUR",
        description: "Product 1",
    }] };

const str = JSON.stringify(payload);

console.log(str);
