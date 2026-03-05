import { chat } from './core/llm.js';
import { execSync, spawn } from 'child_process';
import fs from 'fs';

const MODELS = [
    'mlx-community/Qwen3.5-4B-4bit',
    'mlx-community/Qwen3.5-9B-4bit'
];

const PORT = 18889;

async function runBenchmark(model) {
    console.log(`\n🚀 Benchmarking model: ${model}`);

    // 1. Kill any existing process on benchmark port
    try {
        console.log(`💀 Cleaning port ${PORT}...`);
        const pids = execSync(`lsof -ti:${PORT}`).toString().trim();
        if (pids) {
            execSync(`kill -9 ${pids}`);
            await new Promise(r => setTimeout(r, 2000)); // wait for release
        }
    } catch (e) { }

    // 2. Start MLX server
    console.log(`⌛ Starting server on port ${PORT}...`);
    const server = spawn('python3', ['-m', 'mlx_lm.server', '--model', model, '--port', PORT.toString(), '--trust-remote-code'], {
        stdio: 'pipe'
    });

    return new Promise((resolve) => {
        let isReady = false;
        server.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('Starting httpd')) {
                isReady = true;
                console.log('✅ Server ready.');
                setTimeout(executeTest, 2000); // Small buffer
            }
        });

        server.on('error', (err) => {
            console.error(`❌ Server process error: ${err.message}`);
            resolve({ model, error: err.message });
        });

        async function executeTest() {
            try {
                process.env.LLM_PORT = PORT.toString();
                process.env.LLM_MODEL = model;
                const startTime = Date.now();
                const res = await chat([{ role: 'user', content: 'Explain gravity in 50 words.' }], {
                    forceLocal: true
                });
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;

                console.log(`TPS: ${res.tps}`);
                resolve({ model, tps: res.tps, duration });
            } catch (e) {
                console.error(`❌ Test failed: ${e.message}`);
                resolve({ model, error: e.message });
            } finally {
                server.kill('SIGKILL');
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Timeout
        setTimeout(() => {
            if (!isReady) {
                console.error('❌ Server startup timed out.');
                server.kill();
                resolve({ model, error: 'Timeout' });
            }
        }, 300000); // 5 mins for download
    });
}

async function main() {
    const results = [];
    for (const model of MODELS) {
        const res = await runBenchmark(model);
        results.push(res);
    }
    console.log('\n--- Final Comparison ---');
    console.table(results);
    process.exit(0);
}

main();
