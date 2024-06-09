

const store = [];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor(id) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const item = store.find(item => item === id);
            if (item) {
                clearInterval(interval);
                resolve(item);
            }
        }, 500);
    });
}

async function reached(id) {
    //await sleep(5000);
    store.push(id);
}

async function run () {
    const id = "123";
    reached(id);
    const result = await waitFor(id);
    console.log(result);
}

run();