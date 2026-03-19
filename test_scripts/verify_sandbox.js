import { safeExecute } from '../core/safe-executor.js';

console.log('--- TEST 1: Allowed Operation (Arithmetic) ---');
const res1 = safeExecute('console.log(1 + 1)');
console.log('Result:', JSON.stringify(res1));

console.log('\n--- TEST 2: Blocked Operation (child_process) ---');
const res2 = safeExecute('const { execSync } = require("child_process"); console.log(execSync("ls"))');
console.log('Result:', JSON.stringify(res2));

console.log('\n--- TEST 3: Blocked Operation (process.env) ---');
const res3 = safeExecute('console.log(process.env.GEMINI_API_KEY)');
console.log('Result:', JSON.stringify(res3));

console.log('\n--- TEST 4: Blocked Operation (process.exit) ---');
const res4 = safeExecute('process.exit(1)');
console.log('Result:', JSON.stringify(res4));

console.log('\n--- TEST 5: Timeout (Infinite Loop) ---');
const res5 = safeExecute('while(true) {}');
console.log('Result:', JSON.stringify(res5));
