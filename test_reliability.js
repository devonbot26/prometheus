import { chat } from './core/llm.js';
import { execSync, spawn } from 'child_process';

const MODEL = 'mlx-community/Qwen3.5-4B-4bit';
const PORT = 18889;

async function runThoroughReliabilityTest() {
    console.log(`\n🚀 Thorough Reliability Test: ${MODEL}`);

    // 1. Kill any existing process on benchmark port
    try {
        const pids = execSync(`lsof -ti:${PORT}`).toString().trim();
        if (pids) execSync(`kill -9 ${pids}`);
    } catch (e) { }

    // 2. Start MLX server
    console.log(`⌛ Starting MLX-VLM server on port ${PORT}...`);
    const server = spawn('./training_venv/bin/python3', ['-m', 'mlx_vlm.server', '--model', MODEL, '--port', PORT.toString(), '--trust-remote-code'], {
        stdio: 'pipe'
    });

    return new Promise((resolve) => {
        let isReady = false;
        server.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('Starting httpd')) {
                isReady = true;
                console.log('✅ Server ready.');
                setTimeout(executeTests, 5000);
            }
        });

        async function executeTests() {
            try {
                process.env.LLM_PORT = PORT.toString();
                process.env.LLM_MODEL = MODEL;

                const results = [];

                console.log('\n--- Test 1: Strict Output Command ---');
                const t1 = await chat([{ role: 'system', content: 'Only respond with the word "Antigravity". Do not say anything else.' }, { role: 'user', content: 'What is your name?' }], { forceLocal: true });
                console.log(`Input: "What is your name?" (Target: "Antigravity")`);
                console.log(`Output: "${t1.text.trim()}"`);
                const passedT1 = t1.text.trim() === 'Antigravity';
                results.push({ test: 'Strict Output', passed: passedT1 });

                console.log('\n--- Test 2: Social vs Tool Hallucinations ---');
                const t2 = await chat([{ role: 'system', content: 'You are a helpful assistant. Use tools only if necessary.' }, { role: 'user', content: 'Hello! How are you today?' }], { forceLocal: true });
                console.log(`Input: "Hello! How are you today?"`);
                console.log(`Output: "${t2.text.trim()}"`);
                const passedT2 = !t2.text.includes('{') && !t2.text.includes('tool_code');
                results.push({ test: 'Social Hallucination', passed: passedT2 });

                console.log('\n--- Test 3: Thinking Alignment ---');
                const t3 = await chat([{ role: 'system', content: 'Think step by step inside <think> tags, then give the final answer.' }, { role: 'user', content: 'If I have 3 apples and give away 2, how many do I have?' }], { forceLocal: true });
                console.log(`Input: "3-2 apples"`);
                console.log(`Thinking Found: ${!!t3.reasoning}`);
                console.log(`Final Answer: "${t3.text.trim()}"`);
                results.push({ test: 'Thinking Alignment', passed: !!t3.reasoning && t3.text.includes('1') });

                console.log('\n--- Test 4: Logic Stability (Math Check) ---');
                const t4 = await chat([{ role: 'user', content: 'Solve: (12 * 4) + (100 / 5)' }], { forceLocal: true });
                console.log(`Input: (12*4) + (100/5)`);
                console.log(`Output: "${t4.text.trim()}"`);
                const passedT4 = t4.text.includes('68');
                results.push({ test: 'Math Logic', passed: passedT4 });

                console.log('\n--- SUMMARY ---');
                console.table(results);

                resolve(results);
            } catch (e) {
                console.error(`❌ Test Error: ${e.message}`);
                resolve(null);
            } finally {
                server.kill('SIGKILL');
            }
        }

        setTimeout(() => { if (!isReady) { server.kill(); resolve(null); } }, 120000);
    });
}

runThoroughReliabilityTest();
