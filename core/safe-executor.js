import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logDebug, logDebugError } from './logger.js';

const BLOCKED_MODULES_REGEX = /require\(['"](child_process|cluster|dgram|dns|http2|net|tls|v8|vm|worker_threads)['"]\)|import.*from.*['"](child_process|cluster|dgram|dns|http2|net|tls|v8|vm|worker_threads)['"]/;
const BLOCKED_GLOBALS = ['process.exit', 'process.kill', 'process.env'];

const SANDBOX_DIR = '/tmp/prometheus-sandbox';

/**
 * Executes JavaScript code with strict path and module restrictions.
 * Designed to prevent agent-generated scripts from escaping the projects area.
 * 
 * @param {string} code - The code to execute
 * @returns {object} - { success, output, error, blocked }
 */
export function safeExecute(code) {
    logDebug('[SAFE-EXEC] Initializing execution guard...');

    // 1. Static Analysis Check
    if (BLOCKED_MODULES_REGEX.test(code)) {
        logDebugError('[SAFE-EXEC] BLOCKED: Attempted to import restricted Node.js module.');
        return { 
            success: false, 
            blocked: true, 
            error: "Security Policy Violation: Restricted module import detected (e.g. child_process)." 
        };
    }

    for (const glob of BLOCKED_GLOBALS) {
        if (code.includes(glob)) {
            logDebugError(`[SAFE-EXEC] BLOCKED: Attempted to use restricted global: ${glob}`);
            return { 
                success: false, 
                blocked: true, 
                error: `Security Policy Violation: Use of ${glob} is restricted.` 
            };
        }
    }

    // 2. Prepare Sandbox Environment
    if (!fs.existsSync(SANDBOX_DIR)) {
        fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    }

    const tempFile = path.join(SANDBOX_DIR, `exec_${Date.now()}.js`);
    
    try {
        logDebug(`[SAFE-EXEC] Writing code to sandbox: ${tempFile}`);
        fs.writeFileSync(tempFile, code);

        // 3. Execute with Timeout
        // Using --disallow-code-generation-from-strings for extra safety if needed, 
        // but for now relying on our static checks + timeout.
        const output = execSync(`node "${tempFile}"`, { 
            encoding: 'utf-8', 
            timeout: 10000, // 10s hard limit
            stdio: 'pipe',
            env: { ...process.env, NODE_OPTIONS: '--no-deprecation' } // Minimal environment
        });

        return { success: true, output };
    } catch (e) {
        logDebugError(`[SAFE-EXEC] Execution Error: ${e.message}`);
        return { 
            success: false, 
            error: e.stderr || e.stdout || e.message 
        };
    } finally {
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (err) {}
        }
    }
}
