import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

/**
 * Perform a system health diagnosis to identify the root cause of an error.
 */
export async function diagnose_system_health(args) {
    let { error_id: errorId, suspect_file: suspectFile } = args;

    // 1. Auto-resolve 'undefined' or missing Error ID
    if (!errorId || errorId === 'undefined') {
        try {
            const { errorManager } = await import('../../core/error-manager.js');
            const activeErrors = errorManager.listActiveErrors();
            errorId = activeErrors.length > 0 ? activeErrors[activeErrors.length - 1].split(':')[0].trim() : 'UNKNOWN_SYSTEM_ERROR';
        } catch (e) {
            errorId = 'ERR_DIAG_FAIL';
        }
    }

    let report = [`## 🏥 System Diagnosis: ${errorId}`, `Generated: ${new Date().toLocaleString()}`];

    try {
        // 2. Resource Audit (Memory)
        const totalRAM = Math.round(os.totalmem() / 1024 / 1024 / 1024);
        let availableMB;
        let swapInfo = "N/A";

        if (os.platform() === 'darwin') {
            try {
                const vmStat = execSync('vm_stat').toString();
                const pageSize = 16384; // 16KB for M1/M2/M3
                const free = parseInt(vmStat.match(/Pages free:\s+(\d+)/)?.[1] || 0);
                const inactive = parseInt(vmStat.match(/Pages inactive:\s+(\d+)/)?.[1] || 0);
                const speculative = parseInt(vmStat.match(/Pages speculative:\s+(\d+)/)?.[1] || 0);
                const purgeable = parseInt(vmStat.match(/Pages purgeable:\s+(\d+)/)?.[1] || 0);
                
                availableMB = Math.floor(((free + inactive + speculative + purgeable) * pageSize) / (1024 * 1024));
                
                const swap = execSync('sysctl vm.swapusage').toString();
                swapInfo = swap.match(/used = ([\d\.]+M)/)?.[1] || "0M";
            } catch (e) {
                availableMB = Math.round(os.freemem() / 1024 / 1024);
            }
        } else {
            availableMB = Math.round(os.freemem() / 1024 / 1024);
        }

        report.push(`### 📈 Resource Audit\n- **Available RAM**: ${availableMB} MB / ${totalRAM} GB (Activity Monitor Match)`);
        report.push(`- **Swap Used**: ${swapInfo}`);
        
        if (availableMB < 500) report.push(`- ⚠️ **WARNING**: Low available memory. Page swapping may occur.`);
        if (availableMB < 100) report.push(`- 🚨 **CRITICAL**: Extremely low memory. Expect instability.`);

        // 3. Syntax Audit (The most common cause of "Dead-End" loops)
        if (suspectFile) {
            report.push(`### 🛠️ Syntax Audit: \`${path.basename(suspectFile)}\``);
            if (fs.existsSync(suspectFile)) {
                try {
                    execSync(`node --check ${suspectFile}`);
                    report.push(`- ✅ Status: Passed syntax check.`);
                } catch (e) {
                    const firstLine = e.message.split('\n').find(l => l.includes('Error:')) || 'Syntax Error';
                    report.push(`- ❌ **SYNTAX ERROR**: \`${firstLine}\``);
                    report.push(`- **Action**: Fix this file immediately using \`replace_file_content\`.`);
                }
            } else {
                report.push(`- ⚠️ Error: File not found at ${suspectFile}`);
            }
        }

        // 4. Process Audit (Check for port conflicts or zombies)
        report.push(`### ⚙️ Process Audit`);
        try {
            const nodeProcs = execSync("ps aux | grep 'node' | grep -v 'grep' | wc -l").toString().trim();
            report.push(`- **Active Node Instances**: ${nodeProcs}`);
            const ports = execSync("lsof -i -P -n | grep LISTEN | grep -E '3000|18888'").toString().trim();
            report.push(ports ? `- **Open Ports (3000/18888)**:\n\`\`\`\n${ports}\n\`\`\`` : "- ✅ Ports 3000 and 18888 are clean.");
        } catch (e) { /* silent skip */ }

        // 5. Loop Prevention & Handoff
        const STATE_FILE = path.join(process.cwd(), 'data', 'HEALING_STATE.json');
        let healingState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {};
        
        const now = Date.now();
        const lastAttempt = healingState[errorId] || 0;
        const minutesSinceLast = (now - lastAttempt) / 60000;

        report.push(`### 🛡️ Decision Tree`);
        const isSwapping = swapInfo !== "0M" && swapInfo !== "N/A";
        
        let finalStatus = "";
        if (lastAttempt > 0 && minutesSinceLast < 5) {
            report.push(`- 🛑 **LOOP DETECTED**: This error was touched ${minutesSinceLast.toFixed(1)}m ago.`);
            report.push(`- **Final Decision**: DO NOT AUTO-FIX. Handing off to human.`);
            generateSymptomsMd(errorId, "Recursive auto-heal loop detected.", report.join('\n\n'));
            finalStatus = "\n\n❌ **CRITICAL FAILURE**: Loop detected. I have generated `SYMPTOMS.md` for the human. **Stop work now.**";
        } else {
            healingState[errorId] = now;
            fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
            fs.writeFileSync(STATE_FILE, JSON.stringify(healingState, null, 2));
            report.push(`- ✅ **Status**: Safe to proceed. No recent recursion detected.`);
            finalStatus = "\n\n✅ **System Health Diagnosis Complete.** You are clear to attempt a fix.";
        }

        if (isSwapping) {
            finalStatus += `\n\n> [!CAUTION]\n> **SYSTEM IS SWAPPING (${swapInfo})**: Disk I/O is slow. Increase your internal patience for tool calls and model loading. Do not assume a timeout is a crash.`;
        }

        return report.join('\n\n') + finalStatus;

    } catch (error) {
        return `❌ **Diagnostic Failure**: ${error.message}`;
    }
}

function generateSymptomsMd(errorId, reason, debugLog) {
    const content = `# 🚨 System Hand-off: ${errorId}
## Context
Prometheus has detected a recursive loop or critical failure that requires human intervention.

**Reason**: ${reason}

## Recommended Human Action
1. Review the diagnostic data below.
2. Check for hidden syntax errors in the suspected files.
3. Restart the Prometheus supervisor if necessary.

## Diagnostic Data
${debugLog}
---
*Generated by Health-Check Skill*
`;
    fs.writeFileSync(path.join(process.cwd(), 'SYMPTOMS.md'), content);
}
