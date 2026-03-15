import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const models = [
    { name: 'DeepSeek Uncensored', id: 'mlx-community/DeepSeek-R1-Distill-Qwen-14B-abliterated-v2-Q4-mlx' },
    { name: 'Qwen Coder 14B', id: 'mlx-community/Qwen2.5-Coder-14B-4bit' },
    { name: 'Qwen 3.5 Distill 9B', id: 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit' }
];

const question = "Design a self-healing node.js supervisor that uses IPC heartbeats to detect child process hangs and performs a port-clean kill before respawning. Explain the edge cases of zombie processes and PID wraparound.";

async function getResponse(modelId) {
    console.log(`Testing model: ${modelId}...`);
    try {
        const res = await fetch('http://127.0.0.1:18888/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: question }],
                temperature: 0.6,
                max_tokens: 4096
            })
        });
        const data = await res.json();
        return data.choices[0].message.content;
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

// This script is meant to be run manually for each model after switching
const modelIndex = process.argv[2] || 0;
const model = models[modelIndex];

if (!model) {
    console.error("Usage: node scripts/benchmark_models.js [0|1|2]");
    process.exit(1);
}

const response = await getResponse(model.id);
const reportPath = path.join(process.cwd(), 'research/intelligence_report.md');

let content = "";
if (fs.existsSync(reportPath)) {
    content = fs.readFileSync(reportPath, 'utf8');
} else {
    content = "# Multi-Model Intelligence Report\n\nComparison of Prometheus brain models on a complex supervisor design task.\n\n";
}

content += `## ${model.name} (${model.id})\n\n${response}\n\n---\n\n`;

fs.writeFileSync(reportPath, content);
console.log(`Report updated with ${model.name} response.`);
