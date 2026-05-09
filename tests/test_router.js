import { routeRequest } from '../core/port-router.js';
import dotenv from 'dotenv';
dotenv.config();

console.log('🧪 Testing Tiered Devon Router...\n');

const testCases = [
    { msg: "What is the weather in Paris?", expected: "Worker (2B)" },
    { msg: "Implement a new OAuth flow for Gmail.", expected: "Reasoner (9B)" },
    { msg: "Hi!", expected: "Worker (2B)" },
    { msg: "/think How many layers should I use?", expected: "Reasoner (9B)" }
];

testCases.forEach(t => {
    const res = routeRequest(t.msg, 'devon');
    const actual = res.port === (parseInt(process.env.LLAMA_PORT_WORKER) || 18889) ? "Worker (2B)" : "Reasoner (9B)";
    console.log(`- Msg: "${t.msg}"`);
    console.log(`  Expected: ${t.expected} | Actual: ${actual}`);
    console.log(`  Story matched: ${res.story ? res.story.id : 'None'}`);
    console.log('---');
});
