import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.resolve(process.env.HOME, 'Documents/projects/Prometheus/logs/errors');
const ARCHIVE_DIR = path.resolve(process.env.HOME, 'Documents/projects/Prometheus/logs/archive');

async function archiveLogs() {
    console.log('📦 Starting log archiving...');

    if (!fs.existsSync(LOGS_DIR)) {
        console.log('No error logs directory found. Skipping.');
        return;
    }

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

    if (files.length <= 50) {
        console.log(`Only ${files.length} error files found. No archiving needed.`);
        return;
    }

    const toArchive = files.slice(50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targetFolder = path.join(ARCHIVE_DIR, timestamp);
    fs.mkdirSync(targetFolder, { recursive: true });

    console.log(`Moving ${toArchive.length} files to archive/${timestamp}...`);

    for (const file of toArchive) {
        fs.renameSync(file.path, path.join(targetFolder, file.name));
    }

    console.log('✅ Archiving complete.');
}

archiveLogs().catch(err => {
    console.error('❌ Archiving failed:', err.message);
    process.exit(1);
});
