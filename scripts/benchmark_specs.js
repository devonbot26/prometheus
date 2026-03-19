import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const TEST_CASES = [
    { name: "1. Check new email", prompt: "Check my unread emails and list the sender of the most recent one." },
    { name: "2. Weather check", prompt: "What is the weather in Toronto right now?" },
    { name: "3. Context Summary", prompt: "Summarize the last 5 turns of our conversation into 3 bullet points." },
    { name: "4. Web search (Yahoo News)", prompt: "Search Yahoo News Canada and summarize the top 10 news stories." }
];

const MAIN_MODEL = "/Users/nelsonwong/Documents/projects/Prometheus/models/Qwen3.5-9B-Claude-Abliterated-mxfp4";

const CONFIGS = [
    { label: "0.5B Draft", draftModel: "mlx-community/Qwen2.5-0.5B-Instruct-4bit" },
    { label: "2B Draft", draftModel: "mlx-community/Qwen2.5-1.5B-Instruct-4bit" }
];

const results = [];

async function killExisting() {
    try {
        execSync("lsof -ti:18888 | xargs kill -9", { stdio: 'ignore' });
        console.log("🧹 Cleaned up port 18888");
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {}
}

function startServer(draftModel) {
    console.log(`🚀 Starting server: ${MAIN_MODEL} with Draft: ${draftModel}...`);
    const server = spawn('node', ['prom.js'], {
        env: { ...process.env, LLM_MODEL: MAIN_MODEL, DRAFT_MODEL: draftModel, SHOW_UI: 'false' },
        stdio: 'pipe'
    });
    return server;
}

async function isHealthy() {
    try {
        const res = await fetch('http://127.0.0.1:18888/v1/models');
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function waitHealthy() {
    console.log("⏳ Waiting for health...");
    let attempts = 0;
    while (attempts < 60) {
        if (await isHealthy()) {
            console.log("✅ Server Ready.");
            return true;
        }
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }
    return false;
}

async function runBenchmark() {
    for (const config of CONFIGS) {
        console.log(`\n\n=== TESTING CONFIG: ${config.label} ===`);
        await killExisting();
        const server = startServer(config.draftModel);
        
        if (!await waitHealthy()) {
            console.error(`❌ Failed to start server for ${config.label}`);
            server.kill('SIGKILL');
            continue;
        }

        const configResults = [];

        for (const test of TEST_CASES) {
            console.log(`\n🏃 Running: ${test.name}`);
            const startTime = Date.now();
            let ttft = 0;
            let tokens = 0;

            try {
                const response = await fetch('http://127.0.0.1:18888/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: MAIN_MODEL,
                        messages: [
                            { role: 'system', content: "You are a helpful assistant with focus on brevity." },
                            { role: 'user', content: test.prompt }
                        ],
                        stream: true
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    if (ttft === 0) ttft = Date.now() - startTime;
                    
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6).trim();
                            if (dataStr === '[DONE]') continue;
                            try {
                                const data = JSON.parse(dataStr);
                                if (data.choices[0].delta.content) tokens++;
                            } catch (e) {}
                        }
                    }
                }

                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;
                const tps = (tokens / duration).toFixed(2);

                console.log(`   ⏱️  TTFT: ${ttft}ms`);
                console.log(`   🏎️  TPS: ${tps}`);
                console.log(`   ⏳ Total: ${duration.toFixed(1)}s`);

                configResults.push({
                    test: test.name,
                    ttft,
                    tps: parseFloat(tps),
                    duration
                });
            } catch (err) {
                console.error(`   ❌ Test failed: ${err.message}`);
                configResults.push({ test: test.name, error: err.message });
            }
        }

        results.push({ config: config.label, data: configResults });
        server.kill('SIGKILL');
        await killExisting();
    }

    console.log("\n\n=== FINAL RESULTS ===");
    console.log(JSON.stringify(results, null, 2));
    fs.writeFileSync('benchmark_results.json', JSON.stringify(results, null, 2));
}

runBenchmark().catch(console.error);
