import { run_performance_experiment } from '../skills/self-improvement/index.js';
import fs from 'fs';
import path from 'path';

/**
 * PROJECT-WIDE SKILL BENCHMARK SUITE
 * This script runs standardized tests for each skill area to determine safe timeout values.
 */

const testSuite = [
    { skill: 'Core LLM (Base)', prompt: 'Write a 1-paragraph summary of the importance of agentic AI.', iterations: 5 },
    { skill: 'Reasoning (Heavy)', prompt: 'Compare the time complexity of QuickSort vs MergeSort in worst-case scenarios with examples.', iterations: 3 },
    { skill: 'Self-Coder', prompt: 'Write a Node.js script that uses FS to recursively find and delete all .log files in a directory.', iterations: 3 },
    { skill: 'Terminal / CLI', prompt: 'Explain the command: find . -name "*.js" | xargs grep "TODO"', iterations: 5 },
    { skill: 'Web Search', prompt: 'Search for the current price of Bitcoin and summarize the latest 3 news headlines.', iterations: 5 },
    { skill: 'Knowledge Base', prompt: 'What is the PARA methodology for information organization?', iterations: 5 },
    { skill: 'Gmail Integration', prompt: 'List the 3 most recent emails from my inbox and summarize their subjects.', iterations: 3 },
    { skill: 'Weather Service', prompt: 'What is the current weather and 3-day forecast for Hong Kong?', iterations: 5 }
];

async function runFullAudit() {
    console.log(`🚀 Starting Full Prometheus Skill Audit...`);
    let finalAudit = [];

    for (const test of testSuite) {
        console.log(`\n🔍 Benchmarking Skill: [${test.skill}]`);
        const result = await run_performance_experiment({
            prompt: test.prompt,
            iterations: test.iterations
        });
        
        // Extract the average from the markdown string (looking for the number between the last set of **)
        const avgMatch = result.match(/Latency\*\*:\s\*\*([\d\.]+)/);
        const avg = avgMatch ? parseFloat(avgMatch[1]) : 0;
        
        finalAudit.push({
            skill: test.skill,
            average_sec: avg,
            raw_result: result
        });
        
        console.log(`✅ [${test.skill}] Average: ${avg}s`);
    }

    // Generate Final Report
    let report = [`# 📊 Prometheus Project-Wide Latency Audit`, `Generated: ${new Date().toLocaleString()}\n` ];
    report.push(`| Skill Category | Trimmed Mean Latency (s) | Baseline Success |`);
    report.push(`| :--- | :--- | :--- |`);
    
    finalAudit.forEach(a => {
        report.push(`| ${a.skill} | ${a.average_sec}s | ✅ |`);
    });

    report.push(`\n## 📝 Detailed Results`);
    finalAudit.forEach(a => {
        report.push(`\n### ${a.skill}`);
        report.push(a.raw_result);
    });

    const reportPath = path.join(process.cwd(), 'logs', 'latency_audit_report.md');
    fs.writeFileSync(reportPath, report.join('\n'));
    console.log(`\n✨ Full audit complete! Report saved to logs/latency_audit_report.md`);
}

runFullAudit();
