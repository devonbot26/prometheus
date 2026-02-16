import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { authorize } from '../skills/gmail/bridge.js';

const BACKUP_ROOT = 'Prometheus-Backup';
const FILE_PATH = '/Users/devonwong/documents_backup.tar.gz';

async function getDriveService() {
    const auth = await authorize();
    return google.drive({ version: 'v3', auth });
}

async function findOrCreateFolder(drive, name) {
    const res = await drive.files.list({
        q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
    };

    const folder = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return folder.data.id;
}

async function uploadFile(drive, filePath, folderId) {
    const fileName = path.basename(filePath);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        return;
    }

    const fileSize = fs.statSync(filePath).size;
    console.log(`Payload Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);

    const res = await drive.files.list({
        q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    });

    const media = {
        mimeType: 'application/gzip',
        body: fs.createReadStream(filePath),
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
    console.log(`✅ Uploaded ${fileName}!`);
}

async function main() {
    console.log('🚀 Starting Documents Backup Upload...');
    try {
        const drive = await getDriveService();
        const rootId = await findOrCreateFolder(drive, BACKUP_ROOT);
        await uploadFile(drive, FILE_PATH, rootId);
    } catch (error) {
        console.error('❌ Upload Failed:', error);
    }
}

main();
