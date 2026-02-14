/**
 * Prometheus CLI Chat Interface
 * Simple terminal-based conversation with Devon.
 */

import 'dotenv/config';
import readline from 'readline';
import { Agent } from '../core/agent.js';

const agent = new Agent();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('');
console.log('🔥 Project Prometheus — Devon v2.0');
console.log('   Type your message. "quit" to exit, "reset" to clear history.');
console.log('─'.repeat(50));
console.log('');

function ask() {
    rl.question('You: ', async (input) => {
        const trimmed = input.trim();
        console.log(`[DEBUG] Received input: "${trimmed}"`);
        if (!trimmed) return ask();

        if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
            console.log('\n👋 See you later!');
            rl.close();
            process.exit(0);
        }

        if (trimmed.toLowerCase() === 'reset') {
            agent.reset();
            return ask();
        }

        try {
            const response = await agent.process(trimmed);
            console.log(`\nDevon [${response.model}]: ${response.text}\n`);
        } catch (e) {
            console.error(`\n❌ Error: ${e.message}\n`);
        }

        ask();
    });
}

ask();
