/**
 * Error Manager
 * Handles logging, tracking, and archiving of system errors.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_ROOT = path.resolve(__dirname, '../logs');
const ERROR_LOGS_DIR = path.join(LOGS_ROOT, 'errors');
const ARCHIVE_DIR = path.join(LOGS_ROOT, 'archive');

// Ensure directories exist
[ERROR_LOGS_DIR, ARCHIVE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Generate a unique Error ID (e.g., ERR-001)
 */
function generateErrorId() {
    const existing = fs.readdirSync(ERROR_LOGS_DIR).filter(f => f.startsWith('ERR-'));
    const archived = fs.readdirSync(ARCHIVE_DIR).filter(f => f.startsWith('ERR-'));
    const allFiles = [...existing, ...archived];
    let maxId = 0;
    for (const f of allFiles) {
        const match = f.match(/ERR-(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxId) maxId = num;
        }
    }
    return `ERR-${String(maxId + 1).padStart(3, '0')}`;
}

export const errorManager = {
    /**
     * Log a new error
     * @param {string} error - The error message or object
     * @param {string} context - Context (Tool name, User request, etc.)
     */
    logError(error, context) {
        const id = generateErrorId();
        const timestamp = new Date().toISOString();

        const logEntry = {
            id,
            timestamp,
            status: 'active',
            error: error instanceof Error ? error.message : String(error),
            context,
            steps_taken: []
        };

        const filePath = path.join(ERROR_LOGS_DIR, `${id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));

        console.error(`[ErrorManager] Logged new error: ${id}`);
        return id;
    },

    /**
     * Add a solution step to an active error log
     */
    addStep(id, stepDescription) {
        const filePath = path.join(ERROR_LOGS_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) return false;

        const logEntry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        logEntry.steps_taken.push({
            timestamp: new Date().toISOString(),
            description: stepDescription
        });

        fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));
        return true;
    },

    /**
     * Resolve and archive an error
     * @param {string} id - Error ID
     * @param {string} solutionSummary - Final solution description
     */
    async resolveError(id, solutionSummary) {
        const srcPath = path.join(ERROR_LOGS_DIR, `${id}.json`);
        if (!fs.existsSync(srcPath)) return { success: false, error: 'Log not found' };

        const logEntry = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        logEntry.status = 'resolved';
        logEntry.resolved_at = new Date().toISOString();
        logEntry.solution = solutionSummary;

        const destPath = path.join(ARCHIVE_DIR, `${id}.json`);
        fs.writeFileSync(destPath, JSON.stringify(logEntry, null, 2));
        fs.unlinkSync(srcPath);

        console.log(`[ErrorManager] Error ${id} resolved and archived.`);

        // Auto-Learn: Save to Knowledge Base (if interface exists)
        // We'll return the entry so the Agent can call the skill
        return { success: true, entry: logEntry };
    },

    /**
     * List all active errors
     */
    listActiveErrors() {
        return fs.readdirSync(ERROR_LOGS_DIR)
            .filter(f => f.startsWith('ERR-') && f.endsWith('.json'))
            .map(f => {
                const content = JSON.parse(fs.readFileSync(path.join(ERROR_LOGS_DIR, f), 'utf-8'));
                return `${content.id}: ${content.error} (Context: ${content.context})`;
            });
    }
};
