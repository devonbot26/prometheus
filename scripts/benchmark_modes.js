import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent } from '../core/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROMPTS = [
    "Design a scalable API rate limiter using Redis. Provide a high-level architecture overview.",
    "Implement a binary search tree in Python with insert and delete methods.",
    "Draft a deployment plan for moving a monolithic app to microservices.",
    "Write a SQL migration script to add a 'status' enum column to a 'users' table.",
    "Explain the pros and cons of event-driven architecture.",
    "Create a React component that fetches and displays a list of users from an API.",
    "Design the database schema for a fast-paced multiplayer game leaderboard.",
    "Write a Bash script to find and delete all .log files older than 30 days.",
    "How would you securely store user passwords in a database?",
    "Implement a fast matrix multiplication function in C++."
];

async function runBenchmark() {
    console.log('🚀 Starting Benchmark (Primary vs Plan vs Build)');

    const resultsDir = path.join(__dirname, '..', 'benchmark_results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }

    // Test the 3 modes
    const modes = ['primary', 'plan', 'build'];
    const summary = [`# Benchmark Results\n\n| Prompt | Mode | Length | Code Blocks |`];
    summary.push(`|---|---|---|---|`);

    for (let i = 0; i < PROMPTS.length; i++) {
        const promptText = PROMPTS[i];
        console.log(`\n--- Prompt ${i + 1}/${PROMPTS.length} ---`);
        console.log(`Q: ${promptText.substring(0, 60)}...`);

        for (const mode of modes) {
            console.log(`🧠 Mode: ${mode}...`);
            const agent = new Agent(); // fresh instance to avoid history
            agent.setMode(mode);
            // Suppress the warning if adapter is missing
            if (mode !== 'primary' && agent.activeMode === 'primary') {
                console.log(`⚠️  Skipping ${mode} because adapter is missing. Did you train it?`);
                continue;
            }

            try {
                const res = await agent.process(promptText);
                const text = res.text;

                // Save output
                const filename = `prompt_${String(i + 1).padStart(2, '0')}_${mode}.md`;
                fs.writeFileSync(path.join(resultsDir, filename), `# Prompt ${i + 1}\n\n**Mode**: ${mode}\n**Question**: ${promptText}\n\n---\n\n${text}`);

                // Analytics
                const codeBlocksMatch = text.match(/```/g);
                const codeBlocks = codeBlocksMatch ? codeBlocksMatch.length / 2 : 0;

                summary.push(`| ${promptText.substring(0, 40)}... | ${mode} | ${text.length} chars | ${codeBlocks} |`);
            } catch (e) {
                console.error(`Error: ${e.message}`);
            }
        }
    }

    fs.writeFileSync(path.join(resultsDir, 'summary.md'), summary.join('\n'));
    console.log(`\n✅ Benchmark complete! See results in ./benchmark_results/`);
    process.exit(0);
}

runBenchmark();
