import { spawn, execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const STATUS_PATH = path.join(PROJECT_ROOT, 'data/benchmarks/status.json');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'data/benchmarks');

const MODELS = {
    '4B': 'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
    '9B': 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit'
};

const CONTEXT_STEPS = [8000, 16000, 32000, 48000, 64000, 96000, 128000];

const SAFETY_CAPS = {
    '9B_baseline': 48000,
    '4B_baseline': 128000,
    '9B_optimized': 128000,
    '4B_optimized': 128000
};

const TEST_MATRIX = [
    { id: '4B_baseline', model: '4B', kv_bits: null },
    { id: '4B_optimized', model: '4B', kv_bits: 4 },
    { id: '9B_baseline', model: '9B', kv_bits: null },
    { id: '9B_optimized', model: '9B', kv_bits: 4 }
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getMemorySnapshot() {
    let rss_mb = 0;
    try {
        const ps = execSync("ps aux | grep 'mlx_lm' | grep -v grep").toString();
        const lines = ps.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            // parts[5] is RSS in KB
            rss_mb += parseInt(parts[5]) / 1024;
        }
    } catch (e) {}

    let swap_mb = 0;
    let compressed_mb = 0;
    try {
        const vm = execSync("vm_stat").toString();
        const pageSize = 4096; // Standard Mac page size is often 4k or 16k, vm_stat uses page counts
        // On M1/M2/M3 it's usually 16k, but vm_stat output is often in 4k blocks depending on OS version
        // Actually vm_stat "page size" is usually 4096 bytes on macOS
        const swapMatch = vm.match(/Swapouts:\s+(\d+)/);
        const compMatch = vm.match(/Pages occupied by compressor:\s+(\d+)/);
        swap_mb = swapMatch ? (parseInt(swapMatch[1]) * pageSize) / (1024 * 1024) : 0;
        compressed_mb = compMatch ? (parseInt(compMatch[1]) * pageSize) / (1024 * 1024) : 0;
    } catch (e) {}

    return { 
        rss_mb: Math.round(rss_mb), 
        swap_mb: Math.round(swap_mb), 
        compressed_mb: Math.round(compressed_mb),
        timestamp: new Date().toISOString()
    };
}

function killExistingServers() {
    console.log("🧹 Cleaning up old MLX processes...");
    try {
        spawnSync('pkill', ['-9', '-f', 'mlx_lm']);
        spawnSync('pkill', ['-9', '-f', 'start_llama.sh']);
    } catch (e) {}
}

function startServer(modelId, kvBits) {
    console.log(`🚀 Starting server for ${modelId} (KV Bits: ${kvBits || '16'})...`);
    const env = { ...process.env, KV_BITS: kvBits || '' };
    const server = spawn('./scripts/start_llama.sh', [modelId], {
        cwd: PROJECT_ROOT,
        env,
        stdio: 'pipe'
    });

    server.stdout.on('data', (data) => {
        // console.log(`[SERVER] ${data}`);
    });

    return server;
}

async function waitServerReady() {
    console.log("⏳ Waiting for server to be ready...");
    for (let i = 0; i < 400; i++) { // Up to 400s
        try {
            const res = await fetch('http://127.0.0.1:18888/v1/models');
            if (res.ok) {
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    console.log(`✅ Server Ready: ${data.data[0].id}`);
                    return true;
                }
            }
        } catch (e) {}
        await sleep(1000);
    }
    return false;
}

function generateContext(tokens) {
    // Approx 4 chars per token for English
    const base = "In the heart of the digital labyrinth, the Prometheus agent navigated through streams of data, searching for the core of the machine's consciousness. ";
    const repeatCount = Math.ceil((tokens * 4) / base.length);
    return base.repeat(repeatCount).slice(0, tokens * 4);
}

async function runTest(runId, modelId, kvBits, tokens) {
    console.log(`\n🏃 RUNNING TEST: ${runId} | Context: ${tokens} tokens`);
    
    const contextText = generateContext(tokens);
    const prompt = contextText + "\n\nSummarize the above in 3 bullet points.";

    const memBefore = getMemorySnapshot();
    const startTime = Date.now();
    let ttft = 0;
    let completionTokens = 0;
    let text = "";

    try {
        const response = await fetch('http://127.0.0.1:18888/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                stream: true,
                temperature: 0.0
            })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            if (ttft === 0) {
                ttft = Date.now() - startTime;
                console.log(`⏱️ TTFT: ${(ttft / 1000).toFixed(1)}s`);
            }

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        const content = data.choices[0].delta.content || "";
                        if (content) {
                            completionTokens++;
                            text += content;
                        }
                    } catch (e) {}
                }
            }
        }

        const endTime = Date.now();
        const totalDuration = (endTime - startTime) / 1000;
        const genDuration = (endTime - startTime - ttft) / 1000;
        const tps = genDuration > 0 ? (completionTokens / genDuration).toFixed(2) : 0;
        const memAfter = getMemorySnapshot();

        return {
            success: true,
            ttft_ms: ttft,
            tps: parseFloat(tps),
            duration_s: totalDuration,
            mem_before: memBefore,
            mem_after: memAfter,
            tokens_in: tokens,
            tokens_out: completionTokens
        };
    } catch (e) {
        console.error(`❌ Test failed: ${e.message}`);
        return { success: false, error: e.message, mem_at_failure: getMemorySnapshot() };
    }
}

async function main() {
    const resume = process.argv.includes('--resume');
    let status = { started_at: new Date().toISOString(), current_run: null, completed_runs: [] };

    if (resume && fs.existsSync(STATUS_PATH)) {
        status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf-8'));
        console.log("🔄 Resuming from status.json...");
    }

    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

    for (const runDef of TEST_MATRIX) {
        const runId = runDef.id;
        const modelId = MODELS[runDef.model];
        const kvBits = runDef.kv_bits;

        // Find existing run info in status for possible resumption
        const completedRun = status.completed_runs.find(r => r.runId === runId);

        // Initialize runResults from existing partial results if resume is true
        const runResults = (resume && completedRun?.results) ? [...completedRun.results] : [];
        console.log(`\n\n=== STARTING RUN: ${runId} ===`);

        for (const tokens of CONTEXT_STEPS) {
            // Safety cap check
            if (tokens > SAFETY_CAPS[runId]) {
                console.log(`🛡️ Safety Cap Reached for ${runId} (${tokens} > ${SAFETY_CAPS[runId]}). Ending run.`);
                break;
            }

            // Skip if already done (robust check)
            const existingResult = runResults.find(r => r.tokens_in === tokens && r.success);
            if (existingResult) {
                console.log(`⏭️ Skipping context ${tokens} (already completed)`);
                continue;
            }

            console.log(`\n--- CONTEXT STEP: ${tokens} tokens ---`);
            killExistingServers();
            await sleep(5000);
            
            const server = startServer(modelId, kvBits);
            if (!await waitServerReady()) {
                console.error(`❌ Failed to start server for ${runId} at ${tokens}. Skipping context.`);
                server.kill();
                continue;
            }

            // Update status before test
            status.current_run = { runId, tokens, status: "RUNNING", timestamp: new Date().toISOString() };
            fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));

            const result = await runTest(runId, modelId, kvBits, tokens);
            result.runId = runId;
            result.kvBits = kvBits || 16;
            result.modelName = runDef.model;
            
            runResults.push(result);

            // Update completed_runs immediately for partial persistence
            const currentRunObj = { runId, model: runDef.model, kv_mode: kvBits || 16, results: runResults };
            const runIdx = status.completed_runs.findIndex(r => r.runId === runId);
            if (runIdx >= 0) {
                status.completed_runs[runIdx] = currentRunObj;
            } else {
                status.completed_runs.push(currentRunObj);
            }

            if (!result.success) {
                console.error(`💥 Fatal error in run ${runId} at ${tokens} tokens.`);
                status.crashed_at = new Date().toISOString();
                fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
            }

            // Update status after test
            status.last_successful = { runId, tokens };
            fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
            
            server.kill();
            killExistingServers();
            console.log(`💤 Cooldown for 15s before next context step...`);
            await sleep(15000); 
        }

        status.current_run = null;
        fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));

        console.log(`🛌 Big Cooldown for 60s before next model/mode...`);
        await sleep(60000);
    }

    console.log("\n\n🎉 ALL TESTS COMPLETE!");
    fs.writeFileSync(path.join(RESULTS_DIR, 'final_results.json'), JSON.stringify(status.completed_runs, null, 2));
}

main().catch(e => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
});
