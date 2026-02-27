/**
 * Prometheus CLI Chat Interface
 * Simple terminal-based conversation with Devon.
 */

console.log('[DEBUG] Loading channels/cli.js...');
import 'dotenv/config';
import readline from 'readline';
import { Agent } from '../core/agent.js';
import { initCronJobs } from '../core/cron.js';

const agent = new Agent();

// Start background cron scheduler
initCronJobs(agent, (output) => {
    // This callback prints background outputs explicitly to the CLI
    console.log(output);
});

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
    const modeTag = agent.activeMode !== 'primary' ? ` [${agent.activeMode}]` : '';
    rl.question(`You${modeTag}: `, async (input) => {
        const trimmed = input.trim();
        console.log(`[DEBUG] Received input: "${trimmed}"`);
        if (!trimmed) return ask();

        if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
            console.log('\n👋 See you later!');
            rl.close();
            // Signal the parent launcher so it can kill the Llama server
            if (process.send) {
                process.send({ type: 'SHUTDOWN' });
            }
            setTimeout(() => process.exit(0), 100);
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

            if (cmd === '/mode') {
                const mode = args[1];
                if (['primary', 'plan', 'build'].includes(mode)) {
                    agent.setMode(mode);
                    console.log(`🧠 Mode switched to: ${mode}`);
                } else {
                    console.log(`Current mode: ${agent.activeMode}. Options: primary, plan, build`);
                }
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

            if (cmd === '/exam') {
                try {
                    const exam = await agent.runNotebookPrompt('exam_predictor.md');
                    console.log('\n📝 MOCK EXAM GENERATED:\n');
                    console.log(exam);
                    console.log('\n(Good luck!)\n');
                } catch (e) {
                    console.error(`❌ ${e.message}`);
                }
                ask();
                return;
            }

            if (cmd === '/study') {
                try {
                    const notes = await agent.runNotebookPrompt('lecture_decoder.md');
                    console.log('\n📚 LECTURE DECODED:\n');
                    console.log(notes);
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
            const speedStr = response.tps ? ` (${response.tps} tok/s)` : '';
            if (response.reasoning && response.reasoning !== response.text) {
                console.log(`\n\x1b[2m[Thinking...]\x1b[0m\n\x1b[2m${response.reasoning}\x1b[0m`);
            }
            console.log(`\nDevon [${response.model}]${speedStr}: ${response.text}\n`);
        } catch (e) {
            console.error(`\n❌ Error: ${e.message}\n`);
        }

        ask();
    });
}

ask();
