import { Agent } from './core/agent.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const agent = new Agent();
    const prompt = process.argv[2] || 'what is the weather tomorrow';
    console.log(`--- TEST START: ${prompt} ---`);
    try {
        await agent.process(prompt, 'INTERACTIVE', (chunk, isReasoning) => {
            process.stdout.write(isReasoning ? `\x1b[33m${chunk}\x1b[0m` : chunk);
        });
        console.log('\n--- TEST END ---');
    } catch (e) {
        console.error('\n--- TEST ERROR ---');
        console.error(e);
    }
}

test();
