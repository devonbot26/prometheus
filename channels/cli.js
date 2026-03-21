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
import { mcpManager } from '../core/mcp-client.js';

logDebug('[DEBUG] Loading channels/cli.js...');

const HANDOFF_PATH = path.resolve(process.cwd(), 'HANDOFF.json');
const PM_STATE_PATH = path.resolve(process.cwd(), 'PM_STATE.json');
const MAX_AUTO_CONTINUES = 10;
let autoStep = 0;

function sendActivity(type, data = {}) {
    if (process.send && process.connected) {
        try {
            process.send({ type, ...data });
        } catch (e) {
            // Channel closed
        }
    }
}

// Initialize MCP and Agent
await mcpManager.initialize();
const agent = new Agent();
agent.registerExternalSkills(mcpManager.getCapabilitiesAsNativeSkills());

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

const cmdLinePrompt = process.argv.slice(process.argv.indexOf('--prompt') + 1).join(' ');
console.log(`[DEBUG] Detected prompt: "${cmdLinePrompt}"`);

function createStreamHandler() {
    let streamHasStarted = false;
    let isNewLine = true;
    let currentColor = '';

    return (chunk, isReasoning) => {
        if (!agent.showThinking && isReasoning) return;

        if (!streamHasStarted) {
            console.log('');
            streamHasStarted = true;
        }

        let out = '';
        const targetColor = isReasoning ? '\x1b[2m' : '';

        // If color changed mid-line
        if (targetColor !== currentColor) {
            out += '\x1b[0m' + targetColor;
            currentColor = targetColor;
        }

        for (let i = 0; i < chunk.length; i++) {
            if (isNewLine) {
                out += '     ';
                isNewLine = false;
            }

            out += chunk[i];

            if (chunk[i] === '\n') {
                isNewLine = true;
            }
        }

        process.stdout.write(out);
    };
}

async function handleResponse(response, streamed = false) {
    lastTps = response.tps || 0;
    const tpsVal = response.tps ? parseFloat(response.tps).toFixed(1) : '0.0';

    // Reset any bleeding colors
    process.stdout.write('\x1b[0m');

    if (!streamed || response.model === 'watchdog-guard') {
        if (!streamed) console.log('');
        if (agent.showThinking && response.reasoning && response.reasoning !== response.text) {
            const thoughtLines = response.reasoning.split('\n');
            for (const line of thoughtLines) {
                console.log(`     \x1b[2m${line}\x1b[0m`);
            }
            console.log('');
        }

        const textLines = response.text.split('\n');
        for (const line of textLines) {
            console.log(`     ${line}`);
        }
    } else {
        console.log(''); // Newline after stream finishes to pad the footer
    }

    console.log('');
    console.log(`     \x1b[36m▣\x1b[0m  \x1b[2m${agent.activeMode} · ${response.model} · ${tpsVal} tok/s\x1b[0m`);
    console.log('');

    if (response.auto_continue && autoStep < MAX_AUTO_CONTINUES) {
        autoStep++;
        try {
            if (fs.existsSync(HANDOFF_PATH)) {
                const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
                const wakeUp = handoff.context;
                console.log(`\n🤖 Auto-Continue [Step ${autoStep}/${MAX_AUTO_CONTINUES}]: Waking ${handoff.to}...\n`);

                agent.setMode(handoff.to);

                const streamCb = createStreamHandler();
                const nextResponse = await agent.process(wakeUp, undefined, streamCb);
                return handleResponse(nextResponse, true);
            }
        } catch (e) {
            console.error(`❌ Relay Error: ${e.message}`);
        }
    }

    if (!response.auto_continue && autoStep > 0 && autoStep < MAX_AUTO_CONTINUES) {
        if (fs.existsSync(PM_STATE_PATH)) {
            try {
                const state = JSON.parse(fs.readFileSync(PM_STATE_PATH, 'utf-8'));
                const pending = state.steps.filter(s => s.status === 'pending');
                if (pending.length > 0) {
                    autoStep++;
                    agent.setMode('team-manager');
                    const currentStepId = state.current_step_id;
                    const nudge = `The worker completed step ${currentStepId}. Please mark it done and proceed to the next step.`;
                    console.log(`\n🔄 [PM RESUME] Auto-nudging Niki to continue plan. Pending: ${pending.length} steps.\n`);
                    const streamCb = createStreamHandler();
                    const nextResponse = await agent.process(nudge, undefined, streamCb);
                    return handleResponse(nextResponse, true);
                }
            } catch (e) {
                console.error(`❌ [PM RESUME] Failed to check plan state: ${e.message}`);
            }
        }
    }

    // Chain complete or cap reached
    if (autoStep > 0) {
        autoStep = 0;
        agent.setMode('primary');
        console.log('✅ Agent relay complete. Returning to primary mode.');
    }

    if (!cmdLinePrompt) ask(); // Only ask if not in batch mode
}

async function runPrompt(text) {
    console.log(`[DEBUG] Starting runPrompt with: "${text}"`);
    try {
        const streamCb = createStreamHandler();
        const response = await agent.process(text, undefined, streamCb);
        await handleResponse(response, true);
        if (cmdLinePrompt) process.exit(0);
    } catch (e) {
        console.error(`\n❌ Error: ${e.message}\n`);
        if (cmdLinePrompt) process.exit(1);
        ask();
    }
}

console.log('');
console.log('🔥 Project Prometheus — Devon v2.0');
console.log('   Type your message. "/?" for help, "quit" to exit.');
console.log('─'.repeat(50));
console.log('');

function ask() {
    const model = (process.env.LLM_MODEL || 'default').split('/').pop();
    const mode = agent.activeMode;

    console.log(`\n  \x1b[36m┃\x1b[0m  \x1b[1m${mode}\x1b[0m  \x1b[2m${model}\x1b[0m`);
    console.log(`  \x1b[36m╹\x1b[0m\x1b[36m${'▀'.repeat(70)}\x1b[0m`);

    // GEP Gene: Auto-Resume Project Loop
    if (mode === 'primary' && fs.existsSync(PM_STATE_PATH) && !global.hasNudged) {
        global.hasNudged = true;
        console.log(`\n🤖 [AUTO-RESUME] Project plan detected. Switching to team-manager...\n`);
        agent.setMode('team-manager');
        const streamCb = createStreamHandler();
        agent.process('get_next_step', undefined, streamCb).then(res => handleResponse(res, true));
        return;
    }

    rl.question(`  \x1b[36m┃\x1b[0m  \x1b[1m>\x1b[0m `, async (input) => {
        sendActivity('ACTIVITY');

        const trimmed = input.trim();
        logDebug(`[DEBUG] Received input: "${trimmed}"`);
        if (!trimmed) return ask();

        if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
            console.log('\n👋 See you later!');
            rl.close();
            if (process.send) {
                sendActivity('SHUTDOWN');
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
                console.log('  /think-toggle      Toggle thinking display');
                console.log('  /think-on/off      Explicit thinking control');
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
                    '1': 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
                    '2': 'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
                    '3': '/Users/nelsonwong/Documents/projects/Prometheus/models/Qwen3.5-9B-Claude-Abliterated-mxfp4',
                    '4': 'mlx-community/Qwen2.5-Coder-14B-4bit'
                };
                const modelId = MODEL_ID_MAP[arg] || arg;
                if (!modelId) {
                    console.log(`\n🧠 **Usage:** /model [1-4|name]`);
                    console.log(`   Presets: 1(Qwen9B v2), 2(Qwen4B v2), 3(Abliterated 9B), 4(Coder 14B)\n`);
                } else {
                    if (process.send) {
                        sendActivity('RESTART_LLAMA', { model: modelId });
                        console.log(`\n🔄 [REQUEST] Switching model to: ${modelId}... (Server will restart)\n`);
                    } else {
                        console.error('❌ Error: This command requires the Prometheus Manager (prom.js) as supervisor.');
                    }
                }
                ask();
                return;
            }

            if (cmd === '/think-toggle') {
                agent.showThinking = !agent.showThinking;
                console.log(`\n🧠 Thinking display is now ${agent.showThinking ? 'ON' : 'OFF'}\n`);
                ask();
                return;
            }

            if (cmd === '/think-on') {
                agent.showThinking = true;
                console.log(`\n🧠 Thinking display is now ON\n`);
                ask();
                return;
            }

            if (cmd === '/think-off') {
                agent.showThinking = false;
                console.log(`\n🧠 Thinking display is now OFF\n`);
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
                    const streamCb = createStreamHandler();
                    const response = await agent.process(content, undefined, streamCb);
                    await handleResponse(response, true);
                } catch (e) {
                    console.error(`❌ Failed to load or process file: ${e.message}`);
                    ask();
                }
                return;
            }
        }

        try {
            const streamCb = createStreamHandler();
            const response = await agent.process(trimmed, undefined, streamCb);
            await handleResponse(response, true);
        } catch (e) {
            console.error(`\n❌ Error: ${e.message}\n`);
            if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
                if (process.send) sendActivity('RESTART_LLAMA');
            }
            ask();
        }
    });
}

if (cmdLinePrompt && cmdLinePrompt.length > 0) {
    runPrompt(cmdLinePrompt);
} else {
    ask();
}
