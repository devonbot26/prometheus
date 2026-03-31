import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs/errors');
const ARCHIVE_DIR = path.resolve(process.cwd(), 'logs/archive');
const AUDIT_LOG = path.resolve(process.cwd(), 'logs/self-improvement.log');

async function archiveLogs() {
    console.log('📦 Starting log archiving...');

    // 1. Error Logs Rotation (File Archiving)
    if (fs.existsSync(LOGS_DIR)) {
        if (!fs.existsSync(ARCHIVE_DIR)) {
            fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        }

        const files = fs.readdirSync(LOGS_DIR)
            .filter(f => f.startsWith('ERR-') && f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(LOGS_DIR, f),
                mtime: fs.statSync(path.join(LOGS_DIR, f)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime); // Newest first

        if (files.length > 50) {
            const toArchive = files.slice(50);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const targetFolder = path.join(ARCHIVE_DIR, timestamp);
            fs.mkdirSync(targetFolder, { recursive: true });

            console.log(`Moving ${toArchive.length} error files to archive/${timestamp}...`);
            for (const file of toArchive) {
                fs.renameSync(file.path, path.join(targetFolder, file.name));
            }
        }
    }

    // 2. Self-Improvement Log Rotation (Truncation)
    if (fs.existsSync(AUDIT_LOG)) {
        const stats = fs.statSync(AUDIT_LOG);
        const maxSizeBytes = 5 * 1024 * 1024; // 5MB

        if (stats.size > maxSizeBytes) {
            console.log(`🔄 Rotating large audit log (${(stats.size / 1024).toFixed(0)} KB)...`);
            const timestamp = new Date().getTime();
            fs.renameSync(AUDIT_LOG, path.join(ARCHIVE_DIR, `self-improvement-${timestamp}.log`));
            fs.writeFileSync(AUDIT_LOG, ''); // Start fresh
        }
    }

    console.log('✅ Archiving complete.');
}

archiveLogs().catch(err => {
    console.error('❌ Archiving failed:', err.message);
    process.exit(1);
});
