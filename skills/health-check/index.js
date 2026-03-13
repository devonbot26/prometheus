import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

export async function diagnose_system_health(args) {
    let errorId = args.error_id;
    const suspectFile = args.suspect_file;

    // 0. Resolve undefined error ID
    if (!errorId || errorId === 'undefined') {
        try {
            const { errorManager } = await import('../../core/error-manager.js');
            const activeErrors = errorManager.listActiveErrors();
            if (activeErrors.length > 0) {
                // Extract code from "ERR-001: description"
                errorId = activeErrors[activeErrors.length - 1].split(':')[0].trim();
                console.log(`🔍 [HEALTH] Auto-resolved 'undefined' error ID to: ${errorId}`);
            } else {
                errorId = 'UNKNOWN_ERROR';
            }
        } catch (e) {
            errorId = 'ERR-LOAD-FAIL';
        }
    }

    let report = [];
    report.push(`## 🏥 System Diagnosis Report for ${errorId}`);
    report.push(`Timestamp: ${new Date().toISOString()}`);

    try {
        // 1. Memory Audit
        const freeMB = Math.round(os.freemem() / 1024 / 1024);
        report.push(`### Memory Audit`);
        report.push(`- Free RAM: ${freeMB} MB`);
        if (freeMB < 200) {
            report.push(`- **WARNING**: Ultra-low memory detected. This may cause LLM hallucinations or truncation errors.`);
        } else {
            report.push(`- Status: Healthy`);
        }

        // 2. Syntax Audit (if applicable)
        report.push(`### Syntax Audit`);
        if (suspectFile && fs.existsSync(suspectFile)) {
            try {
                execSync(`node --check ${suspectFile}`);
                report.push(`- \`${suspectFile}\`: Passed syntax check.`);
            } catch (e) {
                report.push(`- \`${suspectFile}\`: **SYNTAX ERROR DETECTED**`);
                report.push(`  \`\`\`\n${e.message.split('\n')[0]}\n\`\`\``);
                report.push(`- **Recommendation**: Use \`apply_patch\` to fix the syntax error.`);
            }
        } else if (suspectFile) {
            report.push(`- File not found: ${suspectFile}`);
        } else {
            report.push(`- Skipped (No suspect file provided)`);
        }

        // 3. Process Audit
        report.push(`### Process Audit`);
        try {
            const lsof = execSync('lsof -i -P -n | grep node | head -n 5').toString();
            report.push(`- Active Node Connections:\n\`\`\`\n${lsof}\n\`\`\``);
        } catch (e) {
            report.push(`- No active external node connections found.`);
        }

        // 4. Healing State Audit (Dead-End Loop Prevention)
        report.push(`### Loop Prevention Check`);
        const STATE_FILE = path.join(process.cwd(), 'data', 'HEALING_STATE.json');
        let healingState = {};
        if (fs.existsSync(STATE_FILE)) {
            healingState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }

        const now = Date.now();
        const lastAttempt = healingState[errorId] || 0;
        const secondsSinceLast = (now - lastAttempt) / 1000;
        const minutesSinceLast = secondsSinceLast / 60;

        if (lastAttempt > 0 && minutesSinceLast < 5) {
            report.push(`- 🔴 **CRITICAL**: Attempted to heal ${errorId} just ${minutesSinceLast.toFixed(1)} minutes ago.`);
            report.push(`- **Decision**: DEAD-END LOOP DETECTED. DO NOT ATTEMPT TO AUTO-FIX. You must generate SYMPTOMS.md and hand off to the Human.`);

            generateSymptomsMd(errorId, "Dead-end loop detected on auto-heal.", report.join('\n\n'));
        } else {
            report.push(`- 🟢 Safe to proceed: No recent fails for this error (${lastAttempt === 0 ? 'First attempt' : minutesSinceLast.toFixed(1) + 'm ago'}).`);
            healingState[errorId] = now;
            fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
            fs.writeFileSync(STATE_FILE, JSON.stringify(healingState, null, 2));
        }

        return report.join('\n\n');

    } catch (error) {
        return `Failed to complete health diagnosis: ${error.message}`;
    }
}

function generateSymptomsMd(errorId, reason, debugLog) {
    const SYMPTOMS_PATH = path.join(process.cwd(), 'SYMPTOMS.md');
    const content = `# System Hand-off required
## Context
Prometheus hit a critical issue and auto-healing was either disabled or detected a loop.

**Error ID**: ${errorId}
**Reason**: ${reason}

## Recommended Human Action
Please review the system logs and source files related to this error.

## Diagnostic Data
${debugLog}
`;
    fs.writeFileSync(SYMPTOMS_PATH, content);
}
