import { get_weather } from './skills/weather/index.js';

async function test() {
    console.log("Testing weather skill...");
    try {
        const result = await get_weather({ location: "San Francisco" });
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Caught Error:", e);
    }
}

test();
