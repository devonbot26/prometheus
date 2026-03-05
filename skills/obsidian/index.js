import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { logDebug } from '../../core/logger.js';

const OBSIDIAN_BIN = fs.existsSync('/Applications/Obsidian.app/Contents/MacOS/Obsidian')
    ? '"/Applications/Obsidian.app/Contents/MacOS/Obsidian"'
    : 'obsidian';

function execObsidian(cmd, options = {}) {
    return execSync(cmd, { ...options, timeout: 5000 });
}

// Default vault path from system config
// Default vault path relative to user home
const DEFAULT_VAULT = path.join(process.env.HOME, 'Documents/Obsidian/My iMac notebooks');

function getVaultPath(providedPath) {
    return providedPath || DEFAULT_VAULT;
}

/**
 * Helper to ensure the path is within the vault
 */
function getSafePath(vaultPath, relativePath) {
    if (!vaultPath) throw new Error('Vault path is required');
    if (!relativePath) throw new Error('Relative path (notePath) is required');

    const fullPath = path.resolve(vaultPath, relativePath);
    if (!fullPath.startsWith(path.resolve(vaultPath))) {
        throw new Error('Access denied: Path is outside of the vault');
    }
    return fullPath;
}

export async function obsidian_list_notes({ vaultPath }) {
    const vPath = getVaultPath(vaultPath);
    logDebug(`[DEBUG] Obsidian: Listing notes in vault: ${vPath}`);
    if (!fs.existsSync(vPath)) throw new Error(`Vault not found at ${vPath}`);

    const notes = [];
    function scan(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                if (file.name === '.obsidian' || file.name === 'node_modules') continue;
                scan(fullPath);
            } else if (file.name.endsWith('.md')) {
                notes.push(path.relative(vPath, fullPath));
            }
        }
    }

    scan(vPath);
    return notes;
}

export async function obsidian_read_note({ notePath, vaultPath }) {
    if (!notePath) throw new Error('Parameter "notePath" is required to read a note.');
    const vPath = getVaultPath(vaultPath);
    logDebug(`[DEBUG] Obsidian: Reading note: ${notePath} in ${vPath}`);
    const fullPath = getSafePath(vPath, notePath);
    if (!fs.existsSync(fullPath)) throw new Error(`Note not found: ${notePath}`);
    return fs.readFileSync(fullPath, 'utf-8');
}

export async function obsidian_write_note({ notePath, content, vaultPath }) {
    const vPath = getVaultPath(vaultPath);
    const fullPath = getSafePath(vPath, notePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return { success: true, path: notePath };
}

export async function obsidian_append_note({ notePath, content, vaultPath }) {
    const vPath = getVaultPath(vaultPath);
    const fullPath = getSafePath(vPath, notePath);
    if (!fs.existsSync(fullPath)) throw new Error(`Note not found: ${notePath}`);
    fs.appendFileSync(fullPath, `\n${content}`, 'utf-8');
    return { success: true, path: notePath };
}

export async function obsidian_search({ query, vaultPath }) {
    const vPath = getVaultPath(vaultPath);
    logDebug(`[DEBUG] Obsidian: Searching for "${query}" in ${vPath}`);

    // Attempt to use native Obsidian CLI first
    try {
        const results = execObsidian(`${OBSIDIAN_BIN} search query="${query}" format=json`, { encoding: 'utf-8' });
        const data = JSON.parse(results);
        return data.map(result => path.relative(vPath, result.path || result));
    } catch (e) {
        // Fallback or handle missing CLI
        if (e.message.includes('command not found') || e.code === 'ENOENT') {
            logDebug(`[DEBUG] Obsidian CLI not found. Falling back to grep.`);
            // Fallback to grep
            try {
                const results = execSync(`grep -rli "${query}" "${vPath}" --include="*.md"`, { encoding: 'utf-8' });
                return results.split('\n').filter(p => p).map(p => path.relative(vPath, p));
            } catch (err) {
                return [];
            }
        }
        logDebug(`[DEBUG] Obsidian CLI error: ${e.message}`);
        return { error: `Search failed: ${e.message}` };
    }
}

export async function obsidian_log_to_daily_note({ content, vaultPath }) {
    logDebug(`[DEBUG] Obsidian: Logging to daily note.`);
    try {
        // obsidian daily:append content="<text>"
        // Note: we need to escape quotes in content
        const escapedContent = content.replace(/"/g, '\\"');
        execObsidian(`${OBSIDIAN_BIN} daily:append content="${escapedContent}"`, { encoding: 'utf-8' });
        return { success: true, message: "Successfully appended to today's daily note." };
    } catch (e) {
        if (e.message.includes('command not found') || e.code === 'ENOENT') {
            return { error: "Obsidian CLI not found. Please ask the user to enable it in Obsidian (Settings -> General -> Command line interface)." };
        }
        return { error: `Failed to append to daily note: ${e.message}` };
    }
}

export async function obsidian_create_canvas({ canvasPath, nodes, edges, vaultPath }) {
    const vPath = getVaultPath(vaultPath);
    const fullPath = getSafePath(vPath, canvasPath);
    if (!fullPath.endsWith('.canvas')) throw new Error('File must have .canvas extension');

    // spec from kepano/obsidian-skills: 16-character hex string IDs
    const generateId = () => crypto.randomBytes(8).toString('hex');

    const canvas = {
        nodes: nodes.map(n => ({
            id: n.id || generateId(),
            ...n
        })),
        edges: edges.map(e => ({
            id: e.id || generateId(),
            ...e
        }))
    };

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(canvas, null, 2), 'utf-8');

    return { success: true, path: canvasPath, nodeCount: canvas.nodes.length, edgeCount: canvas.edges.length };
}
