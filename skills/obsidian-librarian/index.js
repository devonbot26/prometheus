import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { prompt } from '../../core/llm.js';
import { logDebug, logDebugError } from '../../core/logger.js';

const OBSIDIAN_BIN = fs.existsSync('/Applications/Obsidian.app/Contents/MacOS/Obsidian')
    ? '"/Applications/Obsidian.app/Contents/MacOS/Obsidian"'
    : 'obsidian';

function execObsidian(cmd, options = {}) {
    return execSync(cmd, { ...options, timeout: 5000 });
}

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

        // CRITICAL SAFETY (System Files): Target must not be a protected system file
        try {
            const propCmd = `obsidian property:read name="system_file" path="${fullTarget}" format=json`;
            const propStr = execSync(propCmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
            if (propStr === 'true' || propStr === '"true"') {
                return { error: `Access Denied: Cannot index into ${path.basename(fullTarget)} because it is a protected system_file.` };
            }
        } catch (propErr) {
            // Safe to proceed
        }

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

                // CRITICAL SAFETY (System Files): Check for system_file property
                const relativeOldPath = entry.name.replace(/"/g, '\\"');
                try {
                    const content = fs.readFileSync(oldPath, 'utf-8');
                    if (/^system_file:\s*true/m.test(content) || /^system_file:\s*"true"/m.test(content)) {
                        logDebug(`[DEBUG] Skipped SYSTEM FILE: ${entry.name}`);
                        continue; // Do not touch this file
                    }
                } catch (propErr) {
                    // Property doesn't exist or CLI failed, safe to assume it's not a protected system file
                }

                const newPath = path.join(inboxPath, entry.name);

                // Log for rollback
                rollback.push({ original: oldPath, current: newPath });

                try {
                    // Inject properties-based rollback state
                    execObsidian(`${OBSIDIAN_BIN} property:set name="original_path" value="${relativeOldPath}" path="${relativeOldPath}"`, { encoding: 'utf-8', stdio: 'ignore', cwd: vaultPath });
                } catch (cmdErr) {
                    // Ignored
                }

                fs.renameSync(oldPath, newPath);
                logDebug(`[DEBUG] Move via FS: ${entry.name} to 00_Inbox`);
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

        // 1. Create the file (prefer native obsidian CLI if template is provided, else fallback to touch)
        const { template = '' } = args;
        const relativeTargetPath = path.join('10_Projects', `${project_name}.md`);
        let usedTemplate = false;

        try {
            if (template) {
                execObsidian(`${OBSIDIAN_BIN} create path="${relativeTargetPath}" template="${template}"`, { encoding: 'utf-8', stdio: 'ignore', cwd: vaultPath });
                usedTemplate = true;
            } else {
                throw new Error("No template provided, falling back.");
            }
        } catch (e) {
            // Fallback: Create an empty file with basic title if no template or CLI fails
            fs.writeFileSync(targetPath, `# 🚀 Project: ${project_name}\n\n## 🎯 High-Level Objective\n<Enter project goal here>\n\n---`, 'utf-8');
        }

        // 2. Inject Standardized Artificial Intelligence Tracking Properties
        const today = new Date().toISOString().split('T')[0];

        try {
            // Enforce Core Taxonomy
            execObsidian(`${OBSIDIAN_BIN} property:set name="type" value="project" path="${relativeTargetPath}"`, { stdio: 'ignore', cwd: vaultPath });
            execObsidian(`${OBSIDIAN_BIN} property:set name="status" value="inbox" path="${relativeTargetPath}"`, { stdio: 'ignore', cwd: vaultPath });
            execObsidian(`${OBSIDIAN_BIN} property:set name="created" value="${today}" type="date" path="${relativeTargetPath}"`, { stdio: 'ignore', cwd: vaultPath });

            // Enforce AI Tracking
            execObsidian(`${OBSIDIAN_BIN} property:set name="author" value="Librarian" path="${relativeTargetPath}"`, { stdio: 'ignore', cwd: vaultPath });
        } catch (propErr) {
            logDebugError(`[DEBUG] Failed to inject properties: ${propErr.message}`);
            // Non-fatal, the file was still created
        }

        return {
            success: true,
            path: targetPath,
            used_template: usedTemplate,
            message: `Successfully created project node for '${project_name}' with standardized AI properties.`
        };

    } catch (e) {
        logDebugError(`[DEBUG] Create Node Master Error: ${e.message}`);
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
        let rollback = [];

        // 1. Try to read from the JSON engine log
        if (fs.existsSync(logPath)) {
            rollback = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        } else {
            // 2. Fallback: Decentralized Property-Based Rollback
            logDebug("[DEBUG] No JSON log found. Scanning vault for 'original_path' properties...");
            try {
                // Use grep to rapidly find files containing the property
                const results = execSync(`grep -rl "original_path:" "${vaultPath}" --include="*.md"`, { encoding: 'utf-8' });
                const files = results.split('\n').filter(p => p.trim());

                for (const file of files) {
                    try {
                        const content = fs.readFileSync(file, 'utf-8');
                        const match = content.match(/^original_path:\s*(.+)$/m);

                        let origPath = null;
                        if (match && match[1]) {
                            origPath = match[1].replace(/(^"|"$|',$|^')/g, '').trim();
                        }

                        if (origPath && origPath !== 'null') {
                            rollback.push({
                                current: file,
                                original: path.resolve(vaultPath, origPath)
                            });
                        }
                    } catch (e) {
                        // Skip if property read fails
                    }
                }
            } catch (grepErr) {
                // Grep fails if no matches found
            }
        }

        if (rollback.length === 0) {
            return { error: "No rollback log found, and no decentralized 'original_path' properties found. Nothing to revert." };
        }

        let count = 0;

        for (const entry of rollback) {
            if (fs.existsSync(entry.current)) {
                try {
                    const relativeCurrent = path.relative(vaultPath, entry.current).replace(/"/g, '\\"');
                    // Remove the rollback property so it doesn't pollute the file permanently
                    execObsidian(`${OBSIDIAN_BIN} property:remove name="original_path" path="${relativeCurrent}"`, { encoding: 'utf-8', stdio: 'ignore', cwd: vaultPath });
                } catch (cmdErr) {
                    // Ignored
                }

                fs.renameSync(entry.current, entry.original);
                count++;
            }
        }

        // Clean up log after revert if it exists
        if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

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
 * Sets or updates a YAML property using the native Obsidian CLI.
 */
export async function set_property(args) {
    const { file_path, name, value, type = 'text', vault_path } = args;
    const vaultPath = getVaultPath(vault_path);
    const fullSourcePath = path.resolve(vaultPath, file_path);

    logDebug(`[DEBUG] Setting property '${name}'='${value}' of type '${type}' on ${fullSourcePath}`);

    try {
        if (!fs.existsSync(fullSourcePath)) return { error: `File not found: ${fullSourcePath}` };

        const relativeSourcePath = path.relative(vaultPath, fullSourcePath).replace(/"/g, '\\"');

        // CRITICAL SAFETY (System Files): Do not allow renaming the system_file property itself 
        // OR modifying properties on an already protected system file unless explicitly forced.
        if (name !== 'system_file') {
            try {
                const content = fs.readFileSync(fullSourcePath, 'utf-8');
                if (/^system_file:\s*true/m.test(content) || /^system_file:\s*"true"/m.test(content)) {
                    return { error: `Access Denied: Cannot modify properties of ${path.basename(fullSourcePath)} because it is a protected system_file.` };
                }
            } catch (propErr) {
                // Safe to proceed
            }
        }

        // Escape quotes securely
        const safeValue = value.replace(/"/g, '\\"');

        execObsidian(`${OBSIDIAN_BIN} property:set name="${name}" value="${safeValue}" type="${type}" path="${relativeSourcePath}"`, { encoding: 'utf-8', stdio: 'ignore', cwd: vaultPath });

        return {
            success: true,
            message: `Successfully set property '${name}' to '${value}' on ${path.basename(fullSourcePath)}.`
        };
    } catch (e) {
        logDebugError(`[DEBUG] Property Set Error: ${e.message}`);
        if (e.message.includes('command not found') || e.code === 'ENOENT') {
            return { error: "Obsidian CLI not found. Please ask the user to enable it in Settings -> General -> Command line interface." };
        }
        return { error: `Failed to set property: ${e.message}` };
    }
}

/**
 * Sweeps the vault for a specific search query and autonomously links matching files to a central Hub/MOC.
 * Uses `obsidian search` to find files, and `obsidian prepend` to inject the Bi-directional link.
 */
export async function auto_link_to_hub(args) {
    const { search_query, hub_file_path, vault_path } = args;
    const vaultPath = getVaultPath(vault_path);
    const fullHubPath = path.resolve(vaultPath, hub_file_path);

    logDebug(`[DEBUG] Auto-Linking: Searching for '${search_query}' to link to '${fullHubPath}'`);

    let linkedCount = 0;
    const errors = [];

    try {
        if (!fs.existsSync(fullHubPath)) return { error: `Hub file not found: ${fullHubPath}` };

        // 1. Find all files matching the query
        // E.g., `obsidian search query="#obsidian" format=json path="..."`
        const searchCmd = `${OBSIDIAN_BIN} search query="${search_query}" format=json`;
        const searchResults = execSync(searchCmd, { encoding: 'utf-8', cwd: vaultPath });

        let matchingFiles = [];
        try {
            matchingFiles = JSON.parse(searchResults);
        } catch (e) {
            logDebugError(`[DEBUG] Auto-Link Parse Error: Search returned invalid JSON.`);
            return { error: `Failed to parse search results for query '${search_query}'.` };
        }

        if (matchingFiles.length === 0) {
            return { status: "clean", message: `No files found matching query '${search_query}'.` };
        }

        // The hub file's basename (e.g., "Obsidian.md" -> "Obsidian")
        const hubLinkName = path.basename(fullHubPath, '.md');
        const linkString = `Up: [[${hubLinkName}]]\n\n`;

        // 2. Prepend the bi-directional link to every matching file
        for (const file of matchingFiles) {
            // Note: matchingFiles from CLI might be objects {path, ...} or raw strings depending on CLI version.
            const targetRelPath = typeof file === 'string' ? file : file.path;

            // Skip linking the hub to itself
            if (path.resolve(vaultPath, targetRelPath) === fullHubPath) continue;

            try {
                // obsidian prepend content="Up: [[Obsidian]]\n\n" file="target.md"
                // Using escaped content for the prepend command
                const escapedLinkStr = linkString.replace(/"/g, '\\"').replace(/\n/g, '\\n');
                const relativeTargetReq = targetRelPath.replace(/"/g, '\\"');
                const prependCmd = `${OBSIDIAN_BIN} prepend content="${escapedLinkStr}" path="${relativeTargetReq}"`;
                execSync(prependCmd, { encoding: 'utf-8', stdio: 'ignore', cwd: vaultPath });
                linkedCount++;
            } catch (prependErr) {
                errors.push(`Failed to link ${targetRelPath}: ${prependErr.message}`);
            }
        }

        return {
            success: true,
            linked_count: linkedCount,
            message: `Successfully linked ${linkedCount} files to [[${hubLinkName}]].`,
            errors: errors.length > 0 ? errors : undefined
        };

    } catch (e) {
        logDebugError(`[DEBUG] Auto-Link Master Error: ${e.message}`);
        if (e.message.includes('command not found') || e.code === 'ENOENT') {
            return { error: "Obsidian CLI not found. Required for graph linkage." };
        }
        return { error: `Auto-linking failed: ${e.message}` };
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
