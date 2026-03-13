/**
 * Sys-Admin Skill
 * Manage local system updates and git operations.
 */

import { exec, spawn } from 'child_process';
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
    console.log('🛠️ Initiating Autonomous Gmail Repair...');

    return new Promise((resolve) => {
        const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'system_repair_gmail.js');
        const child = spawn('node', [scriptPath], { cwd: PROJECT_ROOT });

        let capturedUrl = null;

        child.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[sys-repair] ${output.trim()}`);

            // Extract URL from special prefix
            if (output.includes('AUTH_URL: ')) {
                capturedUrl = output.split('AUTH_URL: ')[1].split('\n')[0].trim();
                console.log(`✅ Captured URL: ${capturedUrl}`);
                resolve({
                    success: true,
                    message: "Autonomous listener started. Please provide this URL to the user to authorize. I will automatically finalize once they sign in.",
                    auth_url: capturedUrl
                });
            }
        });

        child.stderr.on('data', (data) => {
            console.error(`[sys-repair-err] ${data.toString()}`);
        });

        child.on('close', (code) => {
            if (code !== 0 && !capturedUrl) {
                resolve({ error: `Repair script exited with code ${code}` });
            }
        });

        // Timeout fallback
        setTimeout(() => {
            if (!capturedUrl) {
                child.kill();
                resolve({ error: "Timed out waiting for Auth URL." });
            }
        }, 10000);
    });
}
