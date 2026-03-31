import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch'; // Required for API calls in the experiment

const LOG_FILE = path.join(process.cwd(), 'logs', 'self-improvement.log');

/**
 * Log a structured activity to the self-improvement audit trail.
 */
export function logActivity(type, activity, details, level = 'INFO') {
    try {
        const logDir = path.dirname(LOG_FILE);
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            type,
            activity,
            details
        };

        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    } catch (e) {
        console.error('⚠️ Failed to write to self-improvement log:', e.message);
    }
}

/**
 * Audit recent errors and suggest improvements.
 */
export async function audit_recent_errors(args) {
    const limit = args.limit || 10;
    const errorDir = path.resolve(process.cwd(), 'logs/errors');
    
    logActivity('AUDIT', 'Error Scan Started', { limit });

    if (!fs.existsSync(errorDir)) {
        return "No error logs found. System appears healthy!";
    }

    const files = fs.readdirSync(errorDir)
        .filter(f => f.startsWith('ERR-') && f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(errorDir, f), 'utf-8')))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

    if (files.length === 0) {
        return "No recent errors found to analyze. System is performing perfectly!";
    }

    let summary = ["## 🔍 Recent Error Audit"];
    let patterns = {};

    files.forEach(err => {
        const category = err.syscall || err.code || 'Unknown';
        patterns[category] = (patterns[category] || 0) + 1;
    });

    summary.push("\n### Pattern Frequency");
    for (const [cat, count] of Object.entries(patterns)) {
        summary.push(`- **${cat}**: ${count} occurrences`);
    }

    if (patterns['Timeout'] > 2) {
        summary.push("\n💡 **Recommendation**: High timeout frequency detected. Consider increasing `TTFT_TIMEOUT` or optimizing skill execution speed.");
    }
    
    if (patterns['EADDRINUSE'] > 1) {
        summary.push("\n💡 **Recommendation**: Multiple port conflict errors detected. The supervisor cleanup logic might need an audit.");
    }

    logActivity('AUDIT', 'Error Scan Completed', { analyzed: files.length, categories: Object.keys(patterns) });
    
    return summary.join('\n') + "\n\n✅ **Audit Complete.** You should now present this report to the user or generate an improvement plan.";
}

/**
 * Analyze code complexity for a specific file.
 * @param {object} args - { file_path: string }
 */
export async function analyze_code_complexity(args) {
    const filePath = path.resolve(process.cwd(), args.file_path);
    logActivity('ANALYSIS', 'Complexity Check Started', { file: args.file_path });
    if (!fs.existsSync(filePath)) return `Error: File not found at ${args.file_path}`;

    // Read file with size limit (1MB max for analysis)
    const stats = fs.statSync(filePath);
    if (stats.size > 1024 * 1024) {
        return `⚠️ Skipping analysis for large file (${(stats.size / 1024).toFixed(1)} KB). Analysis is limited to 1MB to prevent system hangs.`;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    let report = [`## 📊 Complexity Analysis: \`${args.file_path}\``];
    report.push(`- **Total Lines**: ${totalLines}`);

    // Optimized heuristic for long functions
    let longFunctions = [];
    let functionMatch;
    const funcRegex = /(async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/g;
    
    // Find all function starts
    const matches = [...content.matchAll(funcRegex)];
    
    for (let i = 0; i < matches.length; i++) {
        const startIdx = matches[i].index;
        const nextStartIdx = matches[i+1] ? matches[i+1].index : content.length;
        const funcContent = content.substring(startIdx, nextStartIdx);
        const funcLines = funcContent.split('\n').length;
        
        if (funcLines > 100) {
            longFunctions.push({ name: matches[i][2], lines: funcLines });
        }
    }

    if (longFunctions.length > 0) {
        report.push(`### ⚠️ Refactoring Opportunities`);
        longFunctions.forEach(f => {
            report.push(`- \`${f.name}\` is ~${f.lines} lines long. Consider splitting it.`);
        });
    } else {
        report.push(`- Status: Functions look appropriately sized.`);
    }

    logActivity('ANALYSIS', 'Complexity Check Completed', { 
        file: args.file_path, 
        lines: totalLines, 
        long_funcs: longFunctions.length 
    });

    if (totalLines > 1500) {
        report.push(`\n🚨 **Warning**: This file is excessively long (${totalLines} lines). Highly recommended to split into a service/module architecture.`);
    }

    return report.join('\n');
}

/**
 * Cleanup orphaned background processes related to Prometheus.
 */
export async function cleanup_orphaned_processes() {
    try {
        const { execSync } = await import('child_process');
        const myPid = process.pid;
        const parentPid = process.ppid;

        // Pattern for Prometheus related processes
        const patterns = ['prom.js', 'web_server.js', 'mlx_lm', 'uvicorn.*18888'];
        let killCount = 0;
        let pidsToKill = new Set();

        patterns.forEach(pattern => {
            try {
                const cmd = `ps aux | grep "${pattern}" | grep -v grep | awk '{print $2}'`;
                const output = execSync(cmd).toString().trim();
                if (output) {
                    output.split('\n').forEach(pidStr => {
                        const pid = parseInt(pidStr);
                        if (pid && pid !== myPid && pid !== parentPid) {
                            pidsToKill.add(pid);
                        }
                    });
                }
            } catch (e) { /* ignore grep fails */ }
        });

        if (pidsToKill.size > 0) {
            pidsToKill.forEach(pid => {
                try {
                    process.kill(pid, 'SIGKILL');
                    killCount++;
                } catch (e) { /* already dead */ }
            });
            logActivity('SYSTEM', 'Process Cleanup', { killed: killCount, pids: Array.from(pidsToKill) }, 'WARNING');
            return `✅ Successfully cleaned up ${killCount} orphaned background processes.`;
        } else {
            return `ℹ️ No orphaned Prometheus processes detected. System is clean.`;
        }
    } catch (err) {
        return `❌ Error during process cleanup: ${err.message}`;
    }
}

/**
 * Log a specific improvement attempt and its outcome.
 */
export async function log_improvement(args) {
    const { activity, details, success, impact } = args;
    const level = success ? 'INFO' : 'WARNING';
    const status = success ? 'SUCCESS' : 'FAILURE';
    
    logActivity('FIX', activity, { 
        status, 
        impact, 
        details 
    }, level);

    return `✅ Improvement logged: ${activity} (${status}). Impact: ${impact}`;
}

/**
 * Generate a Markdown report of activities from the last 24 hours.
 */
export async function generate_daily_report() {
    if (!fs.existsSync(LOG_FILE)) return "No activity logs found yet.";

    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(l => l.trim());
    const recentEvents = lines.map(l => JSON.parse(l)).filter(e => new Date(e.timestamp) > yesterday);

    if (recentEvents.length === 0) {
        return "# ☀️ Morning Improvement Briefing\nNo autonomous activities were recorded in the last 24 hours. Prometheus is staying calm and efficient!";
    }

    let report = ["# ☀️ Morning Improvement Briefing", `Summary for ${now.toLocaleDateString()}\n`];
    
    const stats = { AUDIT: 0, ANALYSIS: 0, SYSTEM: 0, FIX: 0 };
    const improvementStats = { success: 0, failure: 0 };

    recentEvents.forEach(e => {
        if (stats[e.type] !== undefined) {
            stats[e.type]++;
        } else {
            stats[e.type] = 1;
        }

        if (e.type === 'FIX' && e.details && e.details.status) {
            if (e.details.status === 'SUCCESS') improvementStats.success++;
            if (e.details.status === 'FAILURE') improvementStats.failure++;
        }
    });

    report.push(`### 📊 Activity Breakdown`);
    report.push(`- **Audits Run**: ${stats.AUDIT || 0}`);
    report.push(`- **Code Analyses**: ${stats.ANALYSIS || 0}`);
    report.push(`- **System Cleanups**: ${stats.SYSTEM || 0}`);
    
    if (stats.FIX) {
        const totalFix = improvementStats.success + improvementStats.failure;
        const rate = totalFix > 0 ? ((improvementStats.success / totalFix) * 100).toFixed(0) : 0;
        report.push(`- **Improvements**: ${totalFix} attempts (**${improvementStats.success} Succeeded**, ${improvementStats.failure} Failed) — *${rate}% success rate*`);
    } else {
        report.push(`- **Improvements**: 0 attempts`);
    }

    report.push(`\n### 📝 Recent Log Extracts`);
    report.push(`| Time | Type | Activity | Result | Impact |`);
    report.push(`| :--- | :--- | :--- | :--- | :--- |`);
    
    recentEvents.reverse().slice(0, 15).forEach(e => {
        const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const result = (e.type === 'FIX' && e.details) ? (e.details.status === 'SUCCESS' ? '✅ Pass' : '❌ Fail') : '-';
        const impact = (e.type === 'FIX' && e.details) ? e.details.impact : (typeof e.details === 'object' ? JSON.stringify(e.details).substring(0, 30) + '...' : String(e.details));
        
        report.push(`| ${time} | ${e.type} | ${e.activity} | ${result} | ${impact} |`);
    });

    return report.join('\n') + "\n\n✅ **Daily Report Generated.** Please present this summary to the user.";
}

/**
 * View the full improvement audit trail.
 */
export async function view_improvement_logs(args) {
    const limit = args.limit || 50;
    if (!fs.existsSync(LOG_FILE)) return "No improvement logs found.";

    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(l => l.trim()).reverse().slice(0, limit);
    let table = ["# 📜 Self-Improvement Audit Trail", `Showing last ${lines.length} events.\n`];
    table.push("| Timestamp | Level | Type | Activity |");
    table.push("| :--- | :--- | :--- | :--- |");

    lines.forEach(l => {
        const e = JSON.parse(l);
        const ts = new Date(e.timestamp).toLocaleString();
        table.push(`| ${ts} | ${e.level} | ${e.type} | ${e.activity} |`);
    });

    return table.join('\n');
}

/**
 * Run an iterative performance test to measure LLM responsiveness.
 * Features outlier rejection to ensure statistical validity.
 * Uses AbortController to prevent hanging sockets (zombie prevention).
 */
export async function run_performance_experiment(args) {
    const prompt = args.prompt;
    const iterations = args.iterations || 10;
    const modelUrl = 'http://127.0.0.1:18888/v1/chat/completions';
    
    if (!prompt) return "Error: 'prompt' parameter is required.";
    
    logActivity('ANALYSIS', 'Performance Experiment Started', { iterations, prompt_length: prompt.length });
    
    let durations = [];
    let failures = 0;

    for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const controller = new AbortController();
        // 120 second strict timeout to allow for heavy reasoning while still preventing zombies
        const timeout = setTimeout(() => controller.abort(), 120000);

        try {
            const res = await fetch(modelUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    max_tokens: 50, // Keep short to focus on TTFT / Base Latency
                    temperature: 0,
                    messages: [{ role: 'user', content: prompt }]
                }),
                signal: controller.signal
            });
            
            if (res.ok) {
                // Ensure we consume the stream so the socket closes cleanly
                await res.text(); 
                durations.push(Date.now() - startTime);
            } else {
                failures++;
            }
        } catch (e) {
            failures++;
            // If it was an abort, log specifically to track zombie-prevention events
            if (e.name === 'AbortError') {
                logActivity('SYSTEM', 'Experiment Request Aborted (Zombie Prevention)', { iteration: i+1 }, 'WARNING');
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    if (durations.length === 0) {
        logActivity('ANALYSIS', 'Performance Experiment Failed', { failures }, 'ERROR');
        return "❌ All test iterations failed. Check if LLM server is running at port 18888.";
    }

    let report = [`# 🚀 Performance Experiment Results`, `Ran ${durations.length} successful iterations (Failed: ${failures}).\n`];
    
    // Outlier Rejection if enough samples
    let validDurations = [...durations];
    let trimmed = false;
    if (validDurations.length >= 4) {
        validDurations.sort((a, b) => a - b);
        const fastest = validDurations.shift(); // Remove 1st
        const slowest = validDurations.pop();   // Remove last
        report.push(`*Outlier Rejection: Removed Fastest (${(fastest/1000).toFixed(2)}s) and Slowest (${(slowest/1000).toFixed(2)}s).*`);
        trimmed = true;
    }

    // Averages
    const totalDuration = validDurations.reduce((a, b) => a + b, 0);
    const avgMs = totalDuration / validDurations.length;
    const avgSec = (avgMs / 1000).toFixed(2);

    report.push(`### 📊 Metrics Summary`);
    report.push(`- **Valid Samples Analyzed**: ${validDurations.length}`);
    report.push(`- **Trimmed Average Latency**: **${avgSec} seconds / request**`);
    
    report.push(`\n### 📝 Raw Durations (ms)`);
    report.push(`\`[${durations.join(', ')}]\``);

    logActivity('ANALYSIS', 'Performance Experiment Completed', { 
        avg_latency_ms: avgMs, 
        samples: validDurations.length,
        trimmed
    });

    return report.join('\n');
}

/**
 * Save an improvement plan to the root.
 * @param {object} args - { findings: string }
 */
export async function generate_improvement_plan(args) {
    const planPath = path.resolve(process.cwd(), 'SELF_IMPROVEMENT_PLAN.md');
    const content = `# 🚀 Prometheus Self-Improvement Plan
Generated: ${new Date().toISOString()}

## Identified Opportunities
${args.findings}

## Action Items
1. [ ] Apply refactors for identified complex functions.
2. [ ] Optimize error-prone handlers.
3. [ ] Verify system stability after patches.

---
*This plan was autonomously generated by the self-improvement skill.*
`;
    fs.writeFileSync(planPath, content);
    return `✅ **Success**: Improvement plan saved to \`${planPath}\`.\n\n**Next Steps**: You should now read this plan to the user and ask if they want to execute the first action item.`;
}
