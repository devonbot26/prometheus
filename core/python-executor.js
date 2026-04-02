import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logDebug, logDebugError } from './logger.js';

const SANDBOX_DIR = '/tmp/prometheus-sandbox';
const PYTHON_GUARD_PATH = path.join(process.cwd(), 'core', 'python-guard.py');

/**
 * Executes Python code with strict static analysis and runtime restrictions.
 * 
 * @param {string} code - The Python code to execute
 * @returns {object} - { success, output, error, blocked }
 */
export function executePython(code) {
    if (!fs.existsSync(SANDBOX_DIR)) {
        fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    }

    const tempFile = path.join(SANDBOX_DIR, `exec_${Date.now()}.py`);
    
    try {
        logDebug(`[PY-EXEC] Preparing sandbox: ${tempFile}`);
        fs.writeFileSync(tempFile, code);

        // 1. Run Static Analysis (Python Guard)
        try {
            execSync(`python3 "${PYTHON_GUARD_PATH}" "${tempFile}"`, {
                encoding: 'utf-8',
                stdio: 'pipe'
            });
        } catch (e) {
            const errorMsg = e.stdout?.trim() || e.stderr?.trim() || 'Static analysis blocked this script.';
            logDebugError(`[PY-EXEC] BLOCKED: ${errorMsg}`);
            return { 
                success: false, 
                blocked: true, 
                error: `Security Policy Violation: ${errorMsg}` 
            };
        }

        // 2. Execute with Timeout
        logDebug(`[PY-EXEC] Analysis passed. Executing...`);
        const output = execSync(`python3 "${tempFile}"`, { 
            encoding: 'utf-8', 
            timeout: 10000, // 10s hard limit
            stdio: 'pipe',
            env: {
                ...process.env,
                PYTHONPATH: process.cwd(), // Allow access to project libs if needed
                PYTHONDONTWRITEBYTECODE: '1'
            }
        });

        return { success: true, output };
    } catch (e) {
        logDebugError(`[PY-EXEC] Runtime Error: ${e.message}`);
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
