import { spawn, execSync } from 'child_process';
import fs from 'fs';

const MODEL = 'mlx-community/Qwen3.5-9B-4bit';
const LOG_FILE = './logs/stress_test_9b.log';

// Complex reasoning/coding prompt
const PROMPT = `
Design a highly scalable, real-time collaborative code editor architecture.
The system must support:
1. Operational Transformation (OT) or CRDTs for conflict resolution.
2. WebSockets for low-latency communication.
3. Persistent storage with versioning (Git-like).
4. Language Server Protocol (LSP) integration for multi-language support.
5. Virtual File System (VFS) to handle millions of files efficiently.
6. A plugin system for third-party extensions.

Please provide:
- A high-level system diagram description.
- Detailed explanation of the conflict resolution strategy.
- Database schema for documents and versions.
- Sample code for a WebSocket-based sync protocol in Node.js.
- How memory should be managed on the server-side for 10,000 concurrent users.

Be as detailed as possible. Generate at least 1500 tokens.
`;

async function runStressTest() {
    console.log(`\n🔥 Starting Qwen3.5 9B Stress Test on M1...`);

    const ramLogs = [];
    const ramMonitor = setInterval(() => {
        try {
            const topOut = execSync('top -l 1 -s 0 | grep PhysMem').toString().trim();
            const timestamp = new Date().toLocaleTimeString();
            ramLogs.push({ time: timestamp, usage: topOut });
            console.log(`[RAM] ${timestamp}: ${topOut}`);
        } catch (e) { }
    }, 2000);

    const startTime = Date.now();
    console.log(`⌛ Starting generation... (This will take a while)`);

    // Using mlx_vlm.generate for the test (since it's a VL model)
    const pythonCmd = '/Users/nelsonwong/Documents/projects/Prometheus/training_venv/bin/python3';
    const gen = spawn(pythonCmd, ['-m', 'mlx_vlm.generate', '--model', MODEL, '--prompt', PROMPT, '--max-tokens', '2000', '--trust-remote-code'], {
        stdio: 'pipe'
    });

    let output = '';
    gen.stdout.on('data', (data) => {
        output += data.toString();
        process.stdout.write('.'); // Progress indicator
    });

    gen.stderr.on('data', (data) => {
        // Suppress verbose mlx output unless error
        const msg = data.toString();
        if (msg.toLowerCase().includes('error')) {
            console.error(`\n❌ MLX Error: ${msg}`);
        }
    });

    gen.on('close', (code) => {
        clearInterval(ramMonitor);
        const endTime = Date.now();
        const durationS = (endTime - startTime) / 1000;

        console.log(`\n\n✅ Test Completed (Exit Code: ${code})`);
        console.log(`Duration: ${durationS.toFixed(2)}s`);

        // Final Analysis Summary
        const summary = {
            model: MODEL,
            durationS,
            promptLength: PROMPT.length,
            ramSnapshots: ramLogs,
            // Simple TPS estimation (approximated tokens based on word count if TPS missing from output)
            totalOutputLength: output.length,
        };

        fs.writeFileSync(LOG_FILE, JSON.stringify(summary, null, 2));
        fs.appendFileSync(LOG_FILE, `\n\n--- FULL OUTPUT ---\n${output}`);

        console.log(`📊 Logs saved to ${LOG_FILE}`);

        // Extract TPS from MLX output if present
        const tpsMatch = output.match(/Generation: \d+ tokens, ([\d.]+) tokens-per-sec/);
        if (tpsMatch) {
            console.log(`✨ Measured TPS: ${tpsMatch[1]}`);
        }

        const peakRamMatch = output.match(/Peak memory: ([\d.]+) GB/);
        if (peakRamMatch) {
            console.log(`📉 Peak Memory (Reported by MLX): ${peakRamMatch[1]} GB`);
        }
    });
}

runStressTest();
