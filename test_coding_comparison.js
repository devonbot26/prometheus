import { spawn } from 'child_process';
import fs from 'fs';

const MODELS = [
    'mlx-community/Qwen3.5-4B-4bit',
    'mlx-community/Qwen3.5-9B-4bit'
];

const PROMPT = "Implement an LRU (Least Recently Used) Cache in Python. The cache should support 'get(key)' and 'put(key, value)' operations in O(1) average time complexity. Include clear comments and an example usage.";

async function runBenchmark(model) {
    console.log(`\n👨‍💻 Benchmarking Coding: ${model}`);

    const pythonCmd = '/Users/nelsonwong/Documents/projects/Prometheus/training_venv/bin/python3';
    // Logic for deciding which generate module to use (mlx_lm for 7B, mlx_vlm for 3.5 series)
    const moduleName = model.includes('3.5') ? 'mlx_vlm.generate' : 'mlx_lm.generate';

    const startTime = Date.now();
    const args = ['-m', moduleName, '--model', model, '--prompt', PROMPT, '--max-tokens', '800', '--trust-remote-code'];

    const gen = spawn(pythonCmd, args, { stdio: 'pipe' });

    let output = '';
    gen.stdout.on('data', (data) => output += data.toString());

    return new Promise((resolve) => {
        gen.on('close', (code) => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            // Extract TPS
            const tpsMatch = output.match(/Generation: \d+ tokens, ([\d.]+) tokens-per-sec/);
            const tps = tpsMatch ? parseFloat(tpsMatch[1]) : 0;
            const ramMatch = output.match(/Peak memory: ([\d.]+) GB/);
            const ram = ramMatch ? parseFloat(ramMatch[1]) : 0;

            console.log(`✅ ${model} -> TPS: ${tps}, RAM: ${ram}GB, Time: ${duration.toFixed(2)}s`);

            resolve({
                model,
                tps,
                ram,
                output: output.split('==========')[1] || output
            });
        });
    });
}

async function main() {
    const results = [];
    for (const model of MODELS) {
        results.push(await runBenchmark(model));
    }

    fs.writeFileSync('./logs/coding_comparison.json', JSON.stringify(results, null, 2));
    console.log('\n📊 Coding comparison data saved to /logs/coding_comparison.json');
}

main();
