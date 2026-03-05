import fs from 'fs';
import path from 'path';

// Root directory of the Prometheus project
// Assuming this is usually run from the project root.
const projectRoot = process.cwd();
const logsDir = path.join(projectRoot, 'logs');

/**
 * Ensures the logs directory exists.
 */
function ensureLogDir() {
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
}

/**
 * Gets the current log file path (daily rotation).
 * Format: logs/action-YYYY-MM-DD.log
 */
function getLogFilePath() {
    ensureLogDir();
    const date = new Date().toISOString().split('T')[0];
    return path.join(logsDir, `action-${date}.log`);
}

/**
 * Logs a significant action to the persistent daily log file.
 * 
 * @param {string} event - The type of event (e.g., "FILE_EDIT", "PLAN_SAVED", "SYSTEM_TEST")
 * @param {string} details - A readable description of what happened.
 * @param {string} [agent] - The agent/persona performing the action (optional).
 */
export function logAction(event, details, agent = 'SYSTEM') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${agent}] [${event}] ${details}\n`;
    const filePath = getLogFilePath();

    try {
        fs.appendFileSync(filePath, logEntry, 'utf8');
    } catch (error) {
        // Fallback to console if file system fails, to prevent crashing the agent
        console.error(`[LOGGER ERROR] Failed to write to action log: ${error.message}`);
        console.log(`Fallback Log -> ${logEntry}`);
    }
}
