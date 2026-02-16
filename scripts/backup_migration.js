import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { authorize } from '../skills/gmail/bridge.js';

const BACKUP_ROOT = 'Prometheus-Backup';
const MIGRATION_FOLDER = 'Migration';

const FILES = [
    'MIGRATION_GUIDE.md',
    'config/credentials.json',
    'config/token.json',
    '.env'
];

async function getDriveService() {
    const auth = await authorize();
    return google.drive({ version: 'v3', auth });
}

async function findOrCreateFolder(drive, name, parentId = null) {
    let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const res = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
        fileMetadata.parents = [parentId];
    }

    const folder = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return folder.data.id;
}

async function uploadFile(drive, filePath, folderId) {
    const fileName = path.basename(filePath);
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
        console.warn(`Skipping missing file: ${filePath}`);
        return;
    }

    const res = await drive.files.list({
        q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    });

    const media = {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(absolutePath),
    };

    if (res.data.files.length > 0) {
        console.log(`Updating ${fileName}...`);
        await drive.files.update({
            fileId: res.data.files[0].id,
            media: media,
        });
    } else {
        console.log(`Uploading ${fileName}...`);
        await drive.files.create({
            resource: {
                name: fileName,
                parents: [folderId],
            },
            media: media,
            fields: 'id',
        });
    }
}

async function main() {
    console.log('🚀 Starting Migration Backup...');
    try {
        const drive = await getDriveService();

        // 1. Get Root Backup Folder
        const rootId = await findOrCreateFolder(drive, BACKUP_ROOT);
        console.log(`Found/Created Root: ${BACKUP_ROOT} (${rootId})`);

        // 2. Get Migration Subfolder
        const migrationId = await findOrCreateFolder(drive, MIGRATION_FOLDER, rootId);
        console.log(`Found/Created Migration Folder: ${MIGRATION_FOLDER} (${migrationId})`);

        // 3. Upload Files
        for (const file of FILES) {
            await uploadFile(drive, file, migrationId);
        }

        console.log('✅ Migration Backup Complete!');
    } catch (error) {
        console.error('❌ Backup Failed:', error);
    }
}

main();
