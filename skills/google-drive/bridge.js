/**
 * Google Drive Skill Bridge
 * Handles backup and restore for Prometheus.
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { authorize } from '../gmail/bridge.js'; // Reuse Gmail's auth logic

const BACKUP_FOLDER_NAME = 'Prometheus-Backup';

// Paths to backup
const FILES_TO_BACKUP = [
    { local: '/Users/devonwong/Documents/prometheus/core/history.json', name: 'history.json' },
    { local: '/Users/devonwong/Documents/ai-web-agent/data/agent.db', name: 'agent.db' },
    { local: '/Users/devonwong/Documents/prometheus/.env', name: 'prometheus.env' }
];

async function getDriveService() {
    const auth = await authorize();
    return google.drive({ version: 'v3', auth });
}

async function getOrCreateBackupFolder(drive) {
    const res = await drive.files.list({
        q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    const folderMetadata = {
        name: BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
    };

    const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id',
    });

    return folder.data.id;
}

export async function drive_backup() {
    console.log('📦 Starting Google Drive backup...');
    try {
        const drive = await getDriveService();
        const folderId = await getOrCreateBackupFolder(drive);

        for (const fileItem of FILES_TO_BACKUP) {
            try {
                // Check if file exists locally
                await fs.access(fileItem.local);

                // Check if file already exists in Drive folder to update instead of create?
                // For simplicity, we'll create with a timestamp or just overwrite if possible.
                // Google Drive allows multiple files with same name, so we search first.
                const searchRes = await drive.files.list({
                    q: `name = '${fileItem.name}' and '${folderId}' in parents and trashed = false`,
                    fields: 'files(id)',
                });

                const media = {
                    mimeType: 'application/octet-stream',
                    body: createReadStream(fileItem.local),
                };

                if (searchRes.data.files && searchRes.data.files.length > 0) {
                    // Update existing
                    const fileId = searchRes.data.files[0].id;
                    await drive.files.update({
                        fileId: fileId,
                        media: media,
                    });
                    console.log(`✅ Updated ${fileItem.name} in Drive`);
                } else {
                    // Create new
                    await drive.files.create({
                        resource: {
                            name: fileItem.name,
                            parents: [folderId],
                        },
                        media: media,
                        fields: 'id',
                    });
                    console.log(`✅ Created ${fileItem.name} in Drive`);
                }
            } catch (e) {
                console.warn(`⚠️  Skipping ${fileItem.name}: ${e.message}`);
            }
        }

        return { success: true, message: 'Backup completed successfully' };
    } catch (e) {
        console.error('❌ Backup failed:', e.message);
        return { success: false, error: e.message };
    }
}

export async function drive_restore() {
    console.log('🔄 Starting Google Drive restore...');
    try {
        const drive = await getDriveService();

        const folderRes = await drive.files.list({
            q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
        });

        if (!folderRes.data.files || folderRes.data.files.length === 0) {
            throw new Error('Backup folder not found in Google Drive');
        }

        const folderId = folderRes.data.files[0].id;

        for (const fileItem of FILES_TO_BACKUP) {
            const searchRes = await drive.files.list({
                q: `name = '${fileItem.name}' and '${folderId}' in parents and trashed = false`,
                fields: 'files(id)',
            });

            if (searchRes.data.files && searchRes.data.files.length > 0) {
                const fileId = searchRes.data.files[0].id;
                const dest = createWriteStream(fileItem.local);

                const res = await drive.files.get(
                    { fileId: fileId, alt: 'media' },
                    { responseType: 'stream' }
                );

                await new Promise((resolve, reject) => {
                    res.data
                        .on('end', () => {
                            console.log(`✅ Restored ${fileItem.name}`);
                            resolve();
                        })
                        .on('error', err => {
                            reject(err);
                        })
                        .pipe(dest);
                });
            } else {
                console.warn(`⚠️  File ${fileItem.name} not found in backup`);
            }
        }

        return { success: true, message: 'Restore completed successfully' };
    } catch (e) {
        console.error('❌ Restore failed:', e.message);
        return { success: false, error: e.message };
    }
}
