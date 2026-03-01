import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { prompt } from '../../core/llm.js';
import { logDebug, logDebugError } from '../../core/logger.js';

/**
 * Helper to get the canonical vault path with a safe fallback.
 */
function getVaultPath(vaultPath) {
    const defaultVault = path.join(process.env.HOME, 'Documents/Obsidian/My iMac notebooks');
    let finalPath = vaultPath || defaultVault;
    if (finalPath.startsWith('~/')) {
        finalPath = path.join(process.env.HOME, finalPath.slice(2));
    }
    return path.resolve(process.cwd(), finalPath);
}

/**
 * Node-based Decision Tree for Finding Scattered READMEs
 */
export async function find_scattered_readmes(args) {
    const { target_dir } = args;
    const defaultRoot = path.join(process.env.HOME, 'Documents');
    const root = target_dir ? path.resolve(process.cwd(), target_dir) : defaultRoot;

    logDebug(`[DEBUG] Node 1: Librarian scanning ${root} for README.md`);

    const excludeFlags = [
        '-type d \\( -name .git -o -name node_modules -o -name _staging -o -name dist -o -name build -o -name .obsidian \\) -prune',
        '-o -type f'
    ].join(' ');

    try {
        const cmd = `find "${root}" ${excludeFlags} -iname "readme.md" -maxdepth 5 -print | head -n 30`;
        const results = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' })
            .split('\n')
            .filter(p => p.trim());

        if (results.length === 0) {
            logDebug(`[DEBUG] Node 2: Vault is clean. No stranded READMEs found.`);
            return {
                status: "clean",
                message: "No scattered READMEs found in the specified directory.",
                files: []
            };
        }

        logDebug(`[DEBUG] Node 2: Found ${results.length} scattered READMEs.`);

        return {
            status: "dirty",
            message: `Found ${results.length} README files that may need consolidation. Use 'index_scattered_note' to process them safely.`,
            files: results.map(p => `~/${path.relative(process.env.HOME, p)}`)
        };

    } catch (e) {
        logDebugError(`[DEBUG] Librarian Search Error: ${e.message}`);
        return {
            error: `Search failed: ${e.message}`,
            hint: "Check directory permissions."
        };
    }
}

/**
 * SAFE: Adds a link to a scattered README into an Obsidian project node.
 * Bypasses the danger of moving active codebase files.
 */
export async function index_scattered_note(args) {
    let { source_path, target_node_path } = args;

    if (source_path.startsWith('~/')) source_path = path.join(process.env.HOME, source_path.slice(2));
    if (target_node_path.startsWith('~/')) target_node_path = path.join(process.env.HOME, target_node_path.slice(2));

    const fullSource = path.resolve(process.cwd(), source_path);
    const fullTarget = path.resolve(process.cwd(), target_node_path);

    logDebug(`[DEBUG] Node 1: Indexing ${fullSource} into ${fullTarget}`);

    try {
        if (!fs.existsSync(fullSource)) return { error: `Source not found: ${fullSource}` };
        if (!fs.existsSync(fullTarget)) return { error: `Target node not found: ${fullTarget}` };

        const relativePath = path.relative(path.dirname(fullTarget), fullSource);
        const linkEntry = `\n- **External README**: [Source File](${relativePath})\n`;

        fs.appendFileSync(fullTarget, linkEntry, 'utf-8');

        return {
            success: true,
            message: `Successfully linked ${path.basename(fullSource)} to ${path.basename(fullTarget)}.`
        };
    } catch (e) {
        logDebugError(`[DEBUG] Indexing Error: ${e.message}`);
        return { error: `Indexing failed: ${e.message}` };
    }
}

/**
 * Ensures the PARA structure exists and sweeps loose root files.
 */
export async function audit_vault_structure(args) {
    const vaultPath = getVaultPath(args.vault_path);
    logDebug(`[DEBUG] Auditing vault structure at ${vaultPath}`);

    const folders = ['00_Inbox', '10_Projects', '20_Areas', '30_Resources', '40_Archive', '.prometheus'];
    const rollback = [];

    try {
        // Idempotency: Create PARA folders
        folders.forEach(f => {
            const p = path.join(vaultPath, f);
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        });

        // Search for loose .md files in the root (depth 1 only)
        const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
        const inboxPath = path.join(vaultPath, '00_Inbox');

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                // Ignore special hub files
                if (entry.name === 'Master_Project_Index.md' || entry.name === 'Obsidian_Organization_Guide.md') {
                    continue;
                }
                const oldPath = path.join(vaultPath, entry.name);
                const newPath = path.join(inboxPath, entry.name);

                // Log for rollback
                rollback.push({ original: oldPath, current: newPath });
                fs.renameSync(oldPath, newPath);
                logDebug(`[DEBUG] Moved loose note: ${entry.name} to 00_Inbox`);
            }
        }

        // Save Rollback Log
        if (rollback.length > 0) {
            const logPath = path.join(vaultPath, '.prometheus/librarian_rollback.json');
            fs.writeFileSync(logPath, JSON.stringify(rollback, null, 2));
        }

        return {
            success: true,
            status: "Organized",
            moved_count: rollback.length,
            message: `Vault organized via PARA. ${rollback.length} loose notes moved to 00_Inbox. Rollback log saved.`
        };

    } catch (e) {
        logDebugError(`[DEBUG] Vault Audit Error: ${e.message}`);
        return { error: e.message || "Failed to audit vault structure." };
    }
}

/**
 * Scaffolds a new Project Hub (MOC) with metadata.
 */
export async function create_project_node(args) {
    const { project_name } = args;
    const vaultPath = getVaultPath(args.vault_path);
    const targetPath = path.join(vaultPath, '10_Projects', `${project_name}.md`);

    logDebug(`[DEBUG] Creating Project Node ${project_name} at ${targetPath}`);

    try {
        if (fs.existsSync(targetPath)) {
            return { status: "exists", path: targetPath, message: "Project node already exists." };
        }

        const template = `---
type: project
status: active
created: ${new Date().toISOString().split('T')[0]}
---
# 🚀 Project: ${project_name}

## 🎯 High-Level Objective
<Enter project goal here>

## 🔗 Internal Documentation
- [[TEAM_TASKS]]
- [[Master_Project_Index]]

## 🛠️ Technical Assets
- [Source Code](file:///path/to/source)

---
## 📝 Observations
- Initialized by Librarian.
`;

        fs.writeFileSync(targetPath, template, 'utf-8');

        return {
            success: true,
            path: targetPath,
            message: `Successfully created project node for '${project_name}'.`
        };

    } catch (e) {
        logDebugError(`[DEBUG] Create Node Error: ${e.message}`);
        return { error: "Creation failed: " + e.message };
    }
}

/**
 * UNDO: Restores files from the last audit_vault_structure run.
 */
export async function revert_librarian_action(args) {
    const vaultPath = getVaultPath(args.vault_path);
    const logPath = path.join(vaultPath, '.prometheus/librarian_rollback.json');

    try {
        if (!fs.existsSync(logPath)) return { error: "No rollback log found. Nothing to revert." };

        const rollback = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        let count = 0;

        for (const entry of rollback) {
            if (fs.existsSync(entry.current)) {
                fs.renameSync(entry.current, entry.original);
                count++;
            }
        }

        // Clean up log after revert
        fs.unlinkSync(logPath);

        return {
            success: true,
            restored_count: count,
            message: `Successfully restored ${count} files to their original root positions.`
        };

    } catch (e) {
        logDebugError(`[DEBUG] Revert Error: ${e.message}`);
        return { error: "Revert failed: " + e.message };
    }
}

/**
 * LEGACY: Kept for compatibility but marked for retirement.
 */
export async function consolidate_note(args) {
    // Forwarding to log for warning
    logDebug("[WARNING] consolidate_note is LEGACY. Use index_scattered_note for non-destructive curation.");
    // Original implementation logic follows...
    let { source_path, vault_inbox } = args;

    if (source_path.startsWith('~/')) {
        source_path = path.join(process.env.HOME, source_path.slice(2));
    }
    const fullSourcePath = path.resolve(process.cwd(), source_path);
    const fullInboxPath = path.resolve(process.cwd(), vault_inbox);

    logDebug(`[DEBUG] Node 1: Consolidating ${fullSourcePath}`);

    if (!fs.existsSync(fullSourcePath)) {
        return { error: `File not found: ${fullSourcePath}` };
    }

    if (!fs.existsSync(fullInboxPath)) {
        fs.mkdirSync(fullInboxPath, { recursive: true });
    }

    try {
        const content = fs.readFileSync(fullSourcePath, 'utf-8');
        const snippet = content.substring(0, 3000);
        const systemPrompt = "You are an Obsidian Librarian. Read the following snippet of a README.md file and generate a short, descriptive file name suitable for an Obsidian vault note. Output ONLY the filename, nothing else. Make sure it ends in .md.";

        const titleResponse = await prompt(systemPrompt, snippet);
        let newFileName = titleResponse.trim();

        if (!newFileName || newFileName.includes('\n') || !newFileName.endsWith('.md')) {
            const parentDir = path.basename(path.dirname(fullSourcePath));
            newFileName = `${parentDir}_README.md`;
        }

        const destinationPath = path.join(fullInboxPath, newFileName);
        const newDocHeader = `> [!info] Original File\n> Source: \`${fullSourcePath}\`\n\n`;
        const updatedContent = newDocHeader + content;

        fs.writeFileSync(destinationPath, updatedContent, 'utf-8');

        return {
            success: true,
            original_file: fullSourcePath,
            new_note_path: destinationPath,
            message: `Successfully consolidated note as '${newFileName}'.`
        };

    } catch (e) {
        logDebugError(`[DEBUG] Librarian Consolidation Error: ${e.message}`);
        return { error: `Consolidation failed: ${e.message}` };
    }
}
