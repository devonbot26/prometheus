/**
 * Prometheus CLI Chat Interface
 * Simple terminal-based conversation with Devon.
 */

import 'dotenv/config';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { Agent } from '../core/agent.js';
import { initCronJobs } from '../core/cron.js';
import { logDebug, toggleDebug } from '../core/logger.js';

logDebug('[DEBUG] Loading channels/cli.js...');

const HANDOFF_PATH = path.resolve(process.cwd(), 'HANDOFF.json');
const MAX_AUTO_CONTINUES = 10;
let autoStep = 0;

const agent = new Agent();
let lastTps = 0;

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
console.log('   Type your message. "/?" for help, "quit" to exit.');
console.log('─'.repeat(50));
console.log('');

function ask() {
    const model = (process.env.LLM_MODEL || 'default').split('/').pop();
    const mode = agent.activeMode;
    const tps = lastTps > 0 ? ` | ${lastTps} t/s` : '';

    // Metadata block: [Model | Mode | TPS]
    const metadata = `\x1b[2m[${model} | ${mode}${tps}]\x1b[0m`;

    rl.question(`${metadata} You: `, async (input) => {
        const trimmed = input.trim();
        logDebug(`[DEBUG] Received input: "${trimmed}"`);
        if (!trimmed) return ask();

        if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
            console.log('\n👋 See you later!');
            rl.close();
            // Signal the parent launcher so it can kill the Llama server
            if (process.send) {
                process.send({ type: 'SHUTDOWN' });
            }
            setTimeout(() => process.exit(0), 100);
            return;
        }

        if (trimmed.toLowerCase() === 'reset' || trimmed.toLowerCase() === '/clear') {
            agent.reset();
            console.log('\n✨ [SYSTEM] Conversation history cleared and memory reset.\n');
            return ask();
        }

        if (trimmed.toLowerCase() === '/debug') {
            const state = toggleDebug();
            console.log(`\n🐞 Debug mode is now ${state ? 'ON' : 'OFF'}\n`);
            return ask();
        }

        // Slash Commands
        if (trimmed.startsWith('/')) {
            const args = trimmed.split(' ');
            const cmd = args[0].toLowerCase();

            if (cmd === '/?' || cmd === '/help') {
                console.log('\n📜 [AVAILABLE COMMANDS]');
                console.log('─'.repeat(50));
                console.log('  /mode [type]       Switch mindset: primary, plan, build, chat');
                console.log('  /model [id]        Switch underlying LLM (e.g. Qwen3.5)');
                console.log('  /notebook [path]   Open a folder as workspace context');
                console.log('  /close             Close current notebook');
                console.log('  /file [path]       Process a long-form prompt from file');
                console.log('  /clear /reset      Wipe conversation history/memory');
                console.log('  /debug             Toggle verbose developer logs');
                console.log('  /think [msg]       Use internal reasoning block');
                console.log('  /podcast /exam     Specialized notebook skills');
                console.log('  quit / exit        Shutdown Prometheus and Llama server');
                console.log('─'.repeat(50));
                console.log('');
                ask();
                return;
            }

            if (cmd === '/notebook') {
                const path = args[1];
                agent.setNotebook(path);
                ask();
                return;
            }

            if (cmd === '/mode') {
                const mode = args[1];
                if (!mode) {
                    console.log(`\n🧠 Current Mode: \x1b[1m${agent.activeMode}\x1b[0m`);
                    console.log(`   Options: primary, plan, build, chat, team-manager\n`);
                } else if (['primary', 'plan', 'build', 'chat', 'team-manager'].includes(mode)) {
                    agent.setMode(mode);
                    console.log(`🧠 Mode switched to: ${mode}`);
                } else {
                    console.log(`❌ Invalid mode. Options: primary, plan, build, chat, team-manager`);
                }
                ask();
                return;
            }

            if (cmd === '/model') {
                const arg = args[1];
                const MODEL_ID_MAP = {
                    '1': 'mlx-community/Qwen3.5-4B-4bit',
                    '2': 'mlx-community/Qwen3.5-9B-4bit'
                };

                const model = MODEL_ID_MAP[arg] || arg;

                if (!arg) {
                    console.log(`\n🤖 Current Model: \x1b[1m${process.env.LLM_MODEL || 'default'}\x1b[0m`);
                    console.log(`   Suggestions:`);
                    console.log(`    [1] mlx-community/Qwen3.5-4B-4bit (Fastest)`);
                    console.log(`    [2] mlx-community/Qwen3.5-9B-4bit (Stronger)`);
                    console.log(`   Usage: /model <id or model_name>\n`);
                } else {
                    console.log(`\n🔄 Requesting model switch to: ${model}...\n`);
                    if (process.send) {
                        process.send({ type: 'RESTART_LLAMA', model: model });
                    }
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
            if (cmd === '/file' || cmd === '/prompt') {
                const filePath = args[1];
                if (!filePath) {
                    console.error('❌ Usage: /file <path/to/prompt.md>');
                    ask();
                    return;
                }
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    console.log(`\n📄 Loaded prompt from ${filePath}\n`);
                    const response = await agent.process(content);
                    await handleResponse(response);
                } catch (e) {
                    console.error(`❌ Failed to load or process file: ${e.message}`);
                    ask();
                }
                return;
            }
        }

        async function handleResponse(response) {
            lastTps = response.tps || 0;
            const speedStr = response.tps ? ` (${response.tps} tok/s)` : '';
            if (response.reasoning && response.reasoning !== response.text) {
                console.log(`\n\x1b[2m[Thinking...]\x1b[0m\n\x1b[2m${response.reasoning}\x1b[0m`);
            }
            console.log(`\nDevon [${response.model}]${speedStr}: ${response.text}\n`);

            if (response.auto_continue && autoStep < MAX_AUTO_CONTINUES) {
                autoStep++;
                try {
                    if (fs.existsSync(HANDOFF_PATH)) {
                        const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
                        const wakeUp = `[SYSTEM] You are now the ${handoff.to}. Your task: ${handoff.context}`;
                        console.log(`\n🤖 Auto-Continue [Step ${autoStep}/${MAX_AUTO_CONTINUES}]: Waking ${handoff.to}...\n`);

                        // Phase 8: Fix CLI Identity Bleed - ensure the agent mode actually switches!
                        agent.setMode(handoff.to);

                        const nextResponse = await agent.process(wakeUp);
                        return handleResponse(nextResponse);
                    }
                } catch (e) {
                    console.error(`❌ Relay Error: ${e.message}`);
                }
            }

            // Chain complete or cap reached
            if (autoStep > 0) {
                autoStep = 0;
                agent.setMode('primary');
                console.log('✅ Agent relay complete. Returning to primary mode.');
            }

            ask();
        }

        try {
            const response = await agent.process(trimmed);
            await handleResponse(response);
        } catch (e) {
            console.error(`\n❌ Error: ${e.message}\n`);
            ask();
        }
    });
}

ask();
