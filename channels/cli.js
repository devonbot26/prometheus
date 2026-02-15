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

        // Slash Commands
        if (trimmed.startsWith('/')) {
            const args = trimmed.split(' ');
            const cmd = args[0].toLowerCase();

            if (cmd === '/notebook') {
                const path = args[1];
                agent.setNotebook(path);
                ask();
                return;
            }

            if (cmd === '/podcast') {
                try {
                    const script = await agent.generatePodcast();
                    console.log('\n🎙️  PODCAST SCRIPT GENERATED:\n');
                    console.log(script);
                    console.log('\n🔊 Audio is playing in the background...\n');
                } catch (e) {
                    console.error(`❌ ${e.message}`);
                }
                ask();
                return;
            }

            if (cmd === '/close') {
                agent.setNotebook(null);
                ask();
                return;
            }
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
