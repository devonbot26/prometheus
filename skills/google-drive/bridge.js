/**
 * Google Drive Skill Bridge (Upgraded)
 * Handles backup, restore, and general file management with path awareness.
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { authorize } from '../gmail/bridge.js'; // Reuse Gmail's auth logic
import { Readable } from 'stream';

const BACKUP_FOLDER_NAME = 'Prometheus-Backup';
const HOMEDIR = process.env.HOME || '/Users/nelsonwong';

// Helper to get Drive service
async function getDriveService() {
    const auth = await authorize();
    return google.drive({ version: 'v3', auth });
}

/**
 * PathResolver: Maps human-readable paths to Google Drive IDs.
 */
class PathResolver {
    constructor(drive) {
        this.drive = drive;
        this.cache = new Map(); // path -> id
    }

    async resolve(pathStr, createIfMissing = false) {
        if (!pathStr || pathStr === '/' || pathStr === '') return 'root';
        const normalized = pathStr.startsWith('/') ? pathStr : '/' + pathStr;
        if (this.cache.has(normalized)) return this.cache.get(normalized);

        const segments = normalized.split('/').filter(s => s.length > 0);
        let currentId = 'root';

        for (const segment of segments) {
            const res = await this.drive.files.list({
                q: `name = '${segment}' and '${currentId}' in parents and trashed = false`,
                fields: 'files(id, name)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });

            if (!res.data.files || res.data.files.length === 0) {
                if (createIfMissing) {
                    const folder = await this.drive.files.create({
                        resource: {
                            name: segment,
                            mimeType: 'application/vnd.google-apps.folder',
                            parents: [currentId]
                        },
                        fields: 'id'
                    });
                    currentId = folder.data.id;
                } else {
                    throw new Error(`Path not found: segment "${segment}" in path "${pathStr}"`);
                }
            } else {
                currentId = res.data.files[0].id;
            }
        }

        this.cache.set(normalized, currentId);
        return currentId;
    }
}

/**
 * ExportMapper: Handles Google Doc exports to plain text.
 */
const GOOGLE_MIME_MAP = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'application/pdf'
};

/**
 * drive_list: List files and folders.
 */
export async function drive_list(args) {
    const targetPath = args?.path || '/';
    try {
        const drive = await getDriveService();
        const resolver = new PathResolver(drive);
        const folderId = await resolver.resolve(targetPath);

        const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size, modifiedTime)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        const files = res.data.files.map(f => ({
            name: f.name,
            type: f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
            id: f.id,
            size: f.size ? `${(f.size / 1024).toFixed(1)} KB` : 'N/A',
            modified: f.modifiedTime
        }));

        return { success: true, path: targetPath, files };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * drive_peek: Metadata + Content Sample.
 */
export async function drive_peek(args) {
    const targetPath = args?.path;
    if (!targetPath) return { success: false, error: 'Path required' };

    try {
        const drive = await getDriveService();
        const resolver = new PathResolver(drive);
        const fileId = await resolver.resolve(targetPath);

        const meta = await drive.files.get({
            fileId,
            fields: 'id, name, mimeType, size'
        });

        const isGoogleType = GOOGLE_MIME_MAP[meta.data.mimeType];
        let content = '';

        if (isGoogleType) {
            const exportRes = await drive.files.export({
                fileId,
                mimeType: isGoogleType
            });
            content = typeof exportRes.data === 'string' ? exportRes.data : '[Binary Content]';
        } else if (meta.data.mimeType.startsWith('text/') || meta.data.mimeType === 'application/json') {
            const res = await drive.files.get({ fileId, alt: 'media' });
            content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        } else {
            content = `[Non-text type: ${meta.data.mimeType}]`;
        }

        // Middle Truncation / Peek logic
        const MAX_PEEK = 2000;
        let peekContent = content;
        if (content.length > MAX_PEEK) {
            peekContent = content.substring(0, MAX_PEEK) + "\n\n...[TRUNCATED for context safety]...";
        }

        return {
            success: true,
            path: targetPath,
            metadata: meta.data,
            peek: peekContent
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * drive_read: Full file content (text-only).
 */
export async function drive_read(args) {
    const targetPath = args?.path;
    try {
        const drive = await getDriveService();
        const resolver = new PathResolver(drive);
        const fileId = await resolver.resolve(targetPath);

        const meta = await drive.files.get({ fileId, fields: 'mimeType' });
        const exportMime = GOOGLE_MIME_MAP[meta.data.mimeType];

        let content;
        if (exportMime) {
            const res = await drive.files.export({ fileId, mimeType: exportMime });
            content = res.data;
        } else {
            const res = await drive.files.get({ fileId, alt: 'media' });
            content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        }

        return { success: true, content };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * drive_write: Create or Update.
 */
export async function drive_write(args) {
    const targetPath = args?.path;
    const content = args?.content;
    if (!targetPath || content === undefined) return { success: false, error: 'Path and content required' };

    try {
        const drive = await getDriveService();
        const name = path.basename(targetPath);
        const dirPath = path.dirname(targetPath);
        
        const resolver = new PathResolver(drive);
        let parentId = 'root';
        if (dirPath !== '.' && dirPath !== '/') {
            parentId = await resolver.resolve(dirPath, true); // Auto-create parents
        }

        // Check if exists
        const searchQuery = `name = '${name}' and '${parentId}' in parents and trashed = false`;
        const search = await drive.files.list({ q: searchQuery, fields: 'files(id)' });

        const media = {
            mimeType: 'text/plain',
            body: Readable.from([content])
        };

        if (search.data.files && search.data.files.length > 0) {
            const fileId = search.data.files[0].id;
            await drive.files.update({ fileId, media });
            return { success: true, message: `Updated ${targetPath}`, fileId };
        } else {
            const res = await drive.files.create({
                resource: { name, parents: [parentId] },
                media,
                fields: 'id'
            });
            return { success: true, message: `Created ${targetPath}`, fileId: res.data.id };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * drive_trash: Safety-first delete.
 */
export async function drive_trash(args) {
    const targetPath = args?.path;
    try {
        const drive = await getDriveService();
        const resolver = new PathResolver(drive);
        const fileId = await resolver.resolve(targetPath);

        await drive.files.update({
            fileId,
            resource: { trashed: true }
        });

        return { success: true, message: `Moved ${targetPath} to trash.` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Keep legacy backup/restore for compatibility
const FILES_TO_BACKUP = [
    { local: path.join(process.cwd(), 'core', 'history.json'), name: 'history.json' },
    { local: path.join(HOMEDIR, 'Documents/projects/ai-web-agent/data/agent.db'), name: 'agent.db' },
    { local: path.join(process.cwd(), '.env'), name: 'prometheus.env' }
];

async function getOrCreateBackupFolder(drive) {
    const res = await drive.files.list({
        q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
    });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        resource: { name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
    });
    return folder.data.id;
}

export async function drive_backup() {
    try {
        const drive = await getDriveService();
        const folderId = await getOrCreateBackupFolder(drive);
        for (const fileItem of FILES_TO_BACKUP) {
            try {
                await fs.access(fileItem.local);
                const searchRes = await drive.files.list({
                    q: `name = '${fileItem.name}' and '${folderId}' in parents and trashed = false`,
                    fields: 'files(id)',
                });
                const media = { mimeType: 'application/octet-stream', body: createReadStream(fileItem.local) };
                if (searchRes.data.files && searchRes.data.files.length > 0) {
                    await drive.files.update({ fileId: searchRes.data.files[0].id, media });
                } else {
                    await drive.files.create({ resource: { name: fileItem.name, parents: [folderId] }, media });
                }
            } catch (e) {}
        }
        return { success: true, message: 'Backup completed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function drive_restore() {
    try {
        const drive = await getDriveService();
        const folderRes = await drive.files.list({
            q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)',
        });
        if (!folderRes.data.files || folderRes.data.files.length === 0) throw new Error('Backup folder not found');
        const folderId = folderRes.data.files[0].id;
        for (const fileItem of FILES_TO_BACKUP) {
            const searchRes = await drive.files.list({
                q: `name = '${fileItem.name}' and '${folderId}' in parents and trashed = false`,
                fields: 'files(id)',
            });
            if (searchRes.data.files && searchRes.data.files.length > 0) {
                const dest = createWriteStream(fileItem.local);
                const res = await drive.files.get({ fileId: searchRes.data.files[0].id, alt: 'media' }, { responseType: 'stream' });
                await new Promise((resolve, reject) => {
                    res.data.on('end', resolve).on('error', reject).pipe(dest);
                });
            }
        }
        return { success: true, message: 'Restore completed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
