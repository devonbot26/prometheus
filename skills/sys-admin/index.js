/**
 * Sys-Admin Skill
 * Manage local system updates and git operations.
 */

import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { drive_backup } from '../google-drive/bridge.js';
import { logDebugError } from '../../core/logger.js';

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

export async function git_sync(args) {
    const { message } = args;
    if (!message) return { error: 'Commit message is required.' };

    console.log('🐙 Starting Git Sync...');
    try {
        // 1. Add all changes
        await execPromise('git add .', { cwd: PROJECT_ROOT });

        // 2. Commit
        // Check if there are changes first to avoid empty commit error
        try {
            await execPromise(`git commit -m "${message}"`, { cwd: PROJECT_ROOT });
        } catch (e) {
            if (e.stdout && e.stdout.includes('nothing to commit')) {
                return { success: true, message: 'No changes to commit. Proceeding to push.' };
            }
            throw e;
        }

        // 3. Push
        const { stdout, stderr } = await execPromise('git push', { cwd: PROJECT_ROOT });

        console.log(stdout);
        if (stderr) console.error(stderr);

        return { success: true, message: 'Codebase successfully synced to GitHub!' };
    } catch (e) {
        logDebugError('Git error:', e);
        return { error: `Git sync failed: ${e.message}` };
    }
}


export async function full_system_backup(args) {
    const { message } = args;
    const results = [];

    // 1. Run Git Sync
    const gitRes = await git_sync({ message });
    results.push(`[GitHub] ${gitRes.success ? '✅ ' + gitRes.message : '❌ ' + gitRes.error}`);

    // 2. Run Drive Backup
    // Use try-catch because drive_backup might throw or return error object
    try {
        const driveRes = await drive_backup();
        results.push(`[Google Drive] ${driveRes.success ? '✅ ' + driveRes.message : '❌ ' + driveRes.error}`);
    } catch (e) {
        results.push(`[Google Drive] ❌ Backup failed: ${e.message}`);
    }

    return {
        success: true,
        message: results.join('\n')
    };
}
export async function system_repair_gmail() {
    console.log('🛠️ Repairing Gmail Authentication...');
    try {
        const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'system_repair_gmail.js');
        const { stdout } = await execPromise(`node ${scriptPath}`);
        return { success: true, output: stdout };
    } catch (e) {
        return { error: `System repair failed: ${e.message}` };
    }
}
