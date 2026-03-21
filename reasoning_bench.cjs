const { spawnSync } = require('child_process');
const fs = require('fs');

const models = [
    'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit',
    'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
    'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit'
];

const prompts = [
    {
        name: 'Logic Puzzle',
        text: 'All bloops are bleeps. Some bleeps are blips. Does it follow that some bloops are blips? Provide a step-by-step reasoning using set theory or formal logic.'
    },
    {
        name: 'Coding Intuition',
        text: 'Explain how to find the first missing positive integer in an unsorted array in O(n) time and O(1) space. Detail the core logic of the swap-based approach.'
    },
    {
        name: 'Strategic Planning',
        text: 'A company has 100 developers. They are split into 10 teams. Each team spends 40% of their time on maintenance and 60% on new features. If you move 20 developers to a new "Platform Engineering" team, how should the remaining 80 developers be reorganized to maintain the same feature output, assuming the Platform team reduces maintenance overhead by 50% for everyone else?'
    }
];

const results = {};

for (const model of models) {
    console.log(`\n🚀 Benchmarking Model: ${model}`);
    results[model] = [];
    
    for (const prompt of prompts) {
        console.log(`  📝 Testing: ${prompt.name}...`);
        try {
            const args = ['-m', 'mlx_lm.generate', '--model', model, '--prompt', prompt.text, '--max-tokens', '800'];
            const child = spawnSync('python3', args, { encoding: 'utf-8' });
            
            if (child.error) {
                console.error(`    ❌ Process error: ${child.error.message}`);
                continue;
            }
            
            results[model].push({
                testName: prompt.name,
                prompt: prompt.text,
                output: child.stdout,
                stderr: child.stderr
            });
        } catch (e) {
            console.error(`  ❌ Error testing ${model} with ${prompt.name}: ${e.message}`);
        }
    }
}

fs.writeFileSync('reasoning_results_raw.json', JSON.stringify(results, null, 2));
console.log('\n✅ Benchmarking Complete. Results saved to reasoning_results_raw.json');
