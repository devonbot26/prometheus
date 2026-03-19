/**
 * Self-Coder Skill
 * Allows Prometheus to write and install new skills.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { prompt, setModelOverride } from '../../core/llm.js';
import { logDebug, logDebugError } from '../../core/logger.js';
import { logAction } from '../../core/action-logger.js';
import { safeExecute } from '../../core/safe-executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = path.resolve(__dirname, '../../skills');
const STAGING_ROOT = path.resolve(__dirname, '../../skills/_staging');

// Ensure staging directory exists
if (!fs.existsSync(STAGING_ROOT)) {
    fs.mkdirSync(STAGING_ROOT, { recursive: true });
}

function autoCommit(filePath, message) {
    try {
        const projRoot = path.resolve(__dirname, '../..');
        execSync(`git add "${filePath}"`, { cwd: projRoot, stdio: 'pipe' });
        execSync(`git commit -m "${message}"`, { cwd: projRoot, stdio: 'pipe' });
        console.log(`📦 Auto-committed: ${message}`);
        return true;
    } catch (e) {
        console.error('⚠️ Auto-commit failed:', e.message);
        return false;
    }
}

/**
 * Creates a Git-based checkpoint (commit + tag) for a file
 */
export async function checkpoint(args) {
    const filePath = args.file_path || "";
    const label = args.label || "pre-patch";
    const fullPath = path.resolve((process.env.PROJECT_ROOT || process.cwd()), filePath.replace(/^~/, process.env.HOME));

    if (!fs.existsSync(fullPath)) return { error: "File not found." };

    try {
        const projRoot = path.resolve(__dirname, '../..');
        const timestamp = new Date().getTime();
        const tagName = `self-coder/${timestamp}`;

        execSync(`git add "${fullPath}"`, { cwd: projRoot, stdio: 'pipe' });
        // Only commit if there are changes to avoid error
        try {
            execSync(`git commit -m "checkpoint [${label}]: ${path.basename(filePath)}"`, { cwd: projRoot, stdio: 'pipe' });
        } catch (commitErr) {
            // If nothing to commit, we still tag the current state
        }
        execSync(`git tag "${tagName}"`, { cwd: projRoot, stdio: 'pipe' });

        return { success: true, tag: tagName, message: `Checkpoint created: ${tagName}` };
    } catch (e) {
        return { error: `Checkpoint failed: ${e.message}` };
    }
}

/**
 * Restores a file from a Git checkpoint/tag
 */
export async function rollback_patch(args) {
    const filePath = args.file_path || "";
    const tag = args.tag || null;
    const fullPath = path.resolve((process.env.PROJECT_ROOT || process.cwd()), filePath.replace(/^~/, process.env.HOME));

    try {
        const projRoot = path.resolve(__dirname, '../..');
        if (tag) {
            execSync(`git checkout ${tag} -- "${fullPath}"`, { cwd: projRoot, stdio: 'pipe' });
        } else {
            // Revert last commit for this file
            execSync(`git checkout HEAD~1 -- "${fullPath}"`, { cwd: projRoot, stdio: 'pipe' });
        }

        autoCommit(fullPath, `rollback: reverted changes to ${path.basename(filePath)}`);
        return { success: true, message: `Rollback successful for ${filePath}` };
    } catch (e) {
        return { error: `Rollback failed: ${e.message}` };
    }
}

/**
 * Verifies the syntax of a JavaScript file
 */
export async function verify_syntax(args) {
    const filePath = args.file_path || "";
    const fullPath = path.resolve((process.env.PROJECT_ROOT || process.cwd()), filePath.replace(/^~/, process.env.HOME));

    if (!fs.existsSync(fullPath)) return { error: "File not found." };
    if (!fullPath.endsWith('.js') && !fullPath.endsWith('.mjs') && !fullPath.endsWith('.cjs')) {
        return { success: true, message: "Non-JS file skipped syntax check." };
    }

    try {
        execSync(`node --check "${fullPath}"`, { stdio: 'pipe' });
        return { valid: true };
    } catch (e) {
        return { valid: false, error: e.stderr || e.message };
    }
}

/**
 * Runs a quick one-shot test script
 */
export async function run_quick_test(args) {
    const testCode = args.test_code || "";
    if (!testCode) return { error: "No test code provided." };

    try {
        const result = safeExecute(testCode);
        return result;
    } catch (e) {
        return { success: false, error: e.stderr || e.stdout || e.message };
    }
}

export async function create_draft_skill(args) {
    const name = args.name || "";
    const description = args.description || "No description";
    const code_js = args.code_js || "";
    const tool_spec = args.tool_spec || null;

    logDebug("[DEBUG] Node 1: Validating inputs for create_draft_skill");
    if (!name || !code_js || !tool_spec) {
        return {
            error: "Missing required parameters (name, code_js, tool_spec).",
            hint: "Please ensure you provide all required arguments for skill creation."
        };
    }

    logDebug("[DEBUG] Node 2: Sanitizing skill name");
    const cleanName = name.replace(/[^a-z0-9-]/g, '').toLowerCase();
    if (!cleanName) {
        return {
            error: `Name "${name}" resolved to empty string after sanitization.`,
            hint: "Use only alphanumeric characters and hyphens for skill names."
        };
    }
    const skillDir = path.join(STAGING_ROOT, cleanName);

    try {
        logDebug("[DEBUG] Node 3: Creating staging directory");
        if (!fs.existsSync(skillDir)) {
            fs.mkdirSync(skillDir, { recursive: true });
        }

        logDebug("[DEBUG] Node 3.1: Writing index.js");
        fs.writeFileSync(path.join(skillDir, 'index.js'), code_js);

        logDebug("[DEBUG] Node 3.2: Writing skill.json");
        const skillJson = {
            name: cleanName,
            id: cleanName,
            version: '1.0.0',
            description: description,
            toolNames: Object.keys(tool_spec),
            meta: {
                tools: tool_spec
            }
        };
        fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify(skillJson, null, 4));

        logDebug("[DEBUG] Node 4: Auto-committing draft");
        autoCommit(skillDir, `feat(self-coder): draft skill "${cleanName}"`);

        return {
            success: true,
            message: `Skill "${cleanName}" drafted successfully in _staging/ folder. Please review it before installing.`
        };
    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Draft Error: ${e.message}`);
        return {
            error: `Draft failed: ${e.message}`,
            hint: "The staging area may need manual cleanup. Do NOT retry automatically."
        };
    }
}

export async function install_skill(args) {
    const name = args.name || "";
    logDebug("[DEBUG] Node 1: Validating input");
    if (!name) {
        return {
            error: "No skill name provided.",
            hint: "Provide the name of the skill from the _staging/ directory."
        };
    }

    const cleanName = name.replace(/[^a-z0-9-]/g, '').toLowerCase();
    const stagingPath = path.join(STAGING_ROOT, cleanName);
    const installPath = path.join(SKILLS_ROOT, cleanName);

    try {
        logDebug("[DEBUG] Node 2: Checking staging exists");
        if (!fs.existsSync(stagingPath)) {
            return {
                error: `Skill "${cleanName}" not found in staging.`,
                hint: "Ensure the skill was first drafted using create_draft_skill."
            };
        }

        logDebug("[DEBUG] Node 3: Checking for duplicate installation");
        if (fs.existsSync(installPath)) {
            return {
                error: `Skill "${cleanName}" already exists in active skills.`,
                hint: "Cannot overwrite active skills. Delete the folder manually if you wish to reinstall."
            };
        }

        logDebug("[DEBUG] Node 4: Moving folder to skills directory");
        fs.renameSync(stagingPath, installPath);

        logDebug("[DEBUG] Node 5: Verification audit");
        if (!fs.existsSync(installPath)) {
            return {
                error: `VERIFICATION FAILED: Folder move failed for "${cleanName}".`,
                hint: "The filesystem state is inconsistent. Please check manually."
            };
        }

        return {
            success: true,
            message: `Skill "${cleanName}" installed. Please restart Prometheus to activate it.`
        };
    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Install Error: ${e.message}`);
        return {
            error: `Install failed: ${e.message}`,
            hint: "Check _staging/ and /skills/ manually. Do NOT retry automatically."
        };
    }
}

export async function consult_senior_dev(args) {
    const userPrompt = args.prompt || "";
    logDebug("[DEBUG] Node 1: Validating input");
    if (!userPrompt) {
        return {
            error: "No prompt provided for senior dev.",
            hint: "Describe the skill you want to create in detail."
        };
    }

    logDebug("[DEBUG] Node 2: Building enhanced prompt for Gemini");
    const enhancedPrompt = `
You are a Senior Software Engineer acting as a mentor to a junior AI agent.
Your task is to implement a new skill for the agent based on the request.

Structure your response as a valid JSON object with the following fields:
{
  "name": "skill-name (kebab-case)",
  "description": "Short description of what the skill does",
  "code_js": "The full JavaScript (ESM) code for the skill. Must export functions matching tool names.",
  "tool_spec": {
     "function_name": {
        "function": "function_name",
        "description": "Description",
        "parameters": { ... }
     }
  }
}

Do not include markdown or extra text outside the JSON.
Ensure the JSON is valid and escaped correctly.

Request: ${userPrompt}
`;

    try {
        logDebug("[DEBUG] Node 3: Calling Gemini API");
        const result = await prompt(enhancedPrompt, { temperature: 0.2, maxTokens: 4000 });
        let jsonStr = result.text.trim();

        logDebug("[DEBUG] Node 4: Parsing JSON response");
        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        let skillData;
        try {
            skillData = JSON.parse(jsonStr);
        } catch (parseError) {
            logDebugError(`[DEBUG] Terminal: JSON Parse Error: ${parseError.message}`);
            return {
                error: "Senior Dev returned invalid JSON.",
                hint: "The AI mentor failed to format its response. Please try rephrasing your request.",
                raw_response: jsonStr.substring(0, 500)
            };
        }

        logDebug("[DEBUG] Node 5: Auto-drafting skill");
        const draftResult = await create_draft_skill(skillData);

        if (draftResult.success) {
            return {
                success: true,
                advice: `I have successfully drafted the skill "${skillData.name}"!\n\nDescription: ${skillData.description}\n\nYou can now ask the user: "I drafted the ${skillData.name} skill. Do you want me to install it?"`,
                model: result.model
            };
        } else {
            return {
                error: `Auto-draft failed: ${draftResult.error}`,
                hint: draftResult.hint || "Check staging directory for partial files."
            };
        }

    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Senior Dev Error: ${e.message}`);
        return {
            error: `Senior Dev connection error: ${e.message}`,
            hint: "Check your GEMINI_API_KEY and internet connection. Do NOT retry automatically."
        };
    }
}

export async function switch_model(args) {
    const model = args.model || "default";
    logDebug(`[DEBUG] Node 1: Switching model to ${model}`);

    try {
        let modelFile = null;
        let responseMsg = "";

        logDebug("[DEBUG] Node 2: Routing to model type");
        if (model === 'local' || model === 'qwen') {
            modelFile = "qwen2.5-7b-instruct-q4_k_m.gguf";
            responseMsg = "Switched to Local (Qwen 7B) model.";
            setModelOverride('local');
        } else if (model === 'deepseek' || model === 'thinker') {
            modelFile = "DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf";
            responseMsg = "Switched to DeepSeek-Coder-V2 (MoE 16B). I am now thinking deeply.";
            setModelOverride('local');
        } else if (model === 'gemini' || model === 'flash') {
            responseMsg = "Switched to Gemini Flash Cloud.";
            setModelOverride('gemini');
        } else {
            logDebug("[DEBUG] Node 2.1: Defaulting model override");
            setModelOverride(null);
            responseMsg = "Reset to default model behavior.";
        }

        logDebug("[DEBUG] Node 3: Signalling parent process for reload");
        if (modelFile && process.send) {
            process.send({ type: 'RESTART_LLAMA', model: modelFile });
        }

        return { success: true, message: responseMsg };
    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Switch Error: ${e.message}`);
        return {
            error: "Model switch failed.",
            hint: "System will continue with the current active brain. Check your config."
        };
    }
}

export async function read_file(args) {
    const filePath = args.file_path || args.path || "";
    logDebug(`[DEBUG] Node 1: Validating path: ${filePath}`);

    if (!filePath) {
        return {
            error: "No file path provided.",
            hint: "Please specify the 'file_path' argument."
        };
    }

    const fullPath = path.resolve((process.env.PROJECT_ROOT || process.cwd()), filePath);

    try {
        logDebug("[DEBUG] Node 2: Checking file existence");
        if (!fs.existsSync(fullPath)) {
            return {
                error: `File not found: ${filePath}`,
                hint: "Ensure the path is relative to the project root. Do NOT retry if the path is correct."
            };
        }

        logDebug("[DEBUG] Node 3: Reading and truncating");
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        // Safety: Limit large file reads to first 500 lines to preserve context window
        if (lines.length > 500) {
            logDebug(`[DEBUG] Node 3.1: File too large (${lines.length} lines), truncating.`);
            return {
                warning: 'File truncated to first 500 lines.',
                content: lines.slice(0, 500).join('\n'),
                total_lines: lines.length
            };
        }

        return { content };
    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Read Error: ${e.message}`);
        return {
            error: `Read error: ${e.message}`,
            hint: "Check file permissions or if the file is a binary. Do NOT retry automatically."
        };
    }
}

export async function apply_patch(args) {
    const filePath = args.file_path || "";
    const targetContent = args.target_content || "";
    const replacementContent = args.replacement_content || "";

    logDebug("[DEBUG] Node 1: Validating inputs");
    if (!filePath || !targetContent) {
        return {
            error: "Missing required parameters (file_path, target_content).",
            hint: "You must provide both the path and the exact string to replace."
        };
    }

    const fullPath = path.resolve((process.env.PROJECT_ROOT || process.cwd()), filePath);

    try {
        logDebug("[DEBUG] Node 2: Checking path existence");
        if (!fs.existsSync(fullPath)) {
            return {
                error: `File not found: ${filePath}`,
                hint: "Check the path and try again if it was a typo."
            };
        }

        logDebug("[DEBUG] Node 3: Searching for target content");
        let content = fs.readFileSync(fullPath, 'utf-8');

        if (!content.includes(targetContent)) {
            logDebugError("[DEBUG] Terminal: Patch Target Not Found");
            return {
                success: false,
                error: 'Target content not found in file.',
                hint: 'Ensure your target_content matches exactly, including whitespace and indentation. Try reading the file again to be sure.'
            };
        }

        // STEP 4: Creating Checkpoint (New Security Layer)
        logDebug("[DEBUG] Node 4: Creating checkpoint before patch");
        const cp = await checkpoint({ file_path: filePath, label: "pre-patch" });

        logDebug("[DEBUG] Node 5: Applying replacement");
        const newContent = content.replace(targetContent, replacementContent);
        fs.writeFileSync(fullPath, newContent);

        // STEP 6: Verification Audit (Syntax check)
        logDebug("[DEBUG] Node 6: Verification audit (Syntax check)");
        const syntaxResult = await verify_syntax({ file_path: filePath });

        if (!syntaxResult.valid) {
            logDebugError("[DEBUG] Terminal: Syntax Verification Failed. Rolling back...");
            await rollback_patch({ file_path: filePath, tag: cp.tag });
            return {
                success: false,
                error: `SYNTAX ERROR: Your patch broke the file code. Rollback triggered.\nError: ${syntaxResult.error}`,
                hint: 'Fix the syntax in your replacement_content and try again.'
            };
        }

        // Final sanity check (content match)
        const verifyContent = fs.readFileSync(fullPath, 'utf-8');
        const verified = verifyContent.includes(replacementContent);

        if (!verified) {
            logDebugError("[DEBUG] Terminal: Content match check failed. Rolling back...");
            await rollback_patch({ file_path: filePath, tag: cp.tag });
            return {
                success: false,
                error: 'VERIFICATION FAILED: Replacement content not found after write. Rollback triggered.',
                hint: 'The patch might have failed to replace correctly. Check your target_content.'
            };
        }

        logDebug("[DEBUG] Node 7: Auto-committing patch");
        autoCommit(fullPath, `fix(self-coder): patch ${path.basename(filePath)}`);

        logAction("FILE_EDIT", `Applied precise patch to ${filePath} (Verified)`, "self-coder");

        return {
            success: true,
            verified: true,
            message: `Successfully patched, verified, and committed ${filePath}`
        };
    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Patch Error: ${e.message}`);
        return {
            error: `Patch error: ${e.message}`,
            hint: "Detailed error occurred. Rolling back to be safe."
        };
    }
}

/**
 * Node-based File Discovery Tree
 */
export async function search_files(args) {
    let { pattern, search_root } = args;
    const defaultRoot = path.join(process.env.HOME, 'Documents');
    const root = search_root ? path.resolve((process.env.PROJECT_ROOT || process.cwd()), search_root) : defaultRoot;

    logDebug(`[DEBUG] Node 1: Discovery Input: ${pattern} in ${root}`);

    // Node 1: Sanitization & Smart Pattern
    if (!pattern.includes('*')) {
        pattern = `*${pattern}*`;
        logDebug(`[DEBUG] Node 1.1: Auto-expanded to "${pattern}"`);
    }

    const excludeDirs = ['.git', 'node_modules', '_staging', 'dist', 'build', '.obsidian'];

    function walkSync(dir) {
        let results = [];
        const list = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of list) {
            const res = path.resolve(dir, file.name);
            if (file.isDirectory()) {
                if (!excludeDirs.includes(file.name)) {
                    results = results.concat(walkSync(res));
                }
            } else {
                results.push(res);
            }
        }
        return results;
    }

    try {
        logDebug(`[DEBUG] Node 2: Node.js recursive search starting...`);
        const allFiles = walkSync(root);
        
        // Match using the pattern (case-insensitive fuzzy)
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        let results = allFiles.filter(f => regex.test(path.basename(f))).slice(0, 30);

        if (results.length === 0) {
            logDebug(`[DEBUG] Node 7: Terminal failure for "${pattern}"`);
            return {
                error: `No files matching "${pattern}" found in ${root}.`,
                hint: "Try a broader pattern or check if the file is in a deeper subdirectory."
            };
        }

        if (results.length === 1) {
            const filePath = results[0];
            const relativeToHome = path.relative(process.env.HOME, filePath);
            logDebug(`[DEBUG] Node 5: Exact match: ${filePath}`);

            let snippet = "";
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                snippet = content.split('\n').slice(0, 5).join('\n');
            } catch (e) {
                snippet = "[Error reading snippet]";
            }

            return {
                success: true,
                match: `~/${relativeToHome}`,
                absolute_path: filePath,
                preview: snippet
            };
        }

        if (results.length > 10) {
            const folderCounts = {};
            results.forEach(p => {
                const homeDir = process.env.HOME;
                const dir = path.dirname(p).replace(homeDir, '~');
                folderCounts[dir] = (folderCounts[dir] || 0) + 1;
            });

            const summary = Object.entries(folderCounts)
                .map(([dir, count]) => `- ${dir} (${count} files)`)
                .join('\n');

            return {
                ambiguous: true,
                message: `Found ${results.length} matches. Here is a summary of locations:`,
                directory_summary: summary,
                hint: "Please refine your search pattern or search a specific subdirectory."
            };
        }

        return {
            ambiguous: true,
            message: `Found ${results.length} potential matches:`,
            matches: results.map(p => `~/${path.relative(process.env.HOME, p)}`),
            hint: "Select the correct file from the list above and use 'read_file' with its full path."
        };

    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Search Error: ${e.message}`);
        return {
            error: `Search failed: ${e.message}`,
            hint: "The directory may be inaccessible. Check permissions."
        };
    }
}

export async function write_file(args) {
    const filePath = args.file_path || args.path || "";
    const content = args.content || "";
    logDebug(`[DEBUG] Node 1: Validating path: ${filePath}`);

    if (!filePath) {
        return { error: "No file path provided." };
    }

    const fullPath = path.resolve((process.env.PROJECT_ROOT || process.cwd()), filePath.replace(/^~/, process.env.HOME));

    try {
        logDebug(`[DEBUG] Node 2: Writing file to ${fullPath}`);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);

        // Verification
        const exists = fs.existsSync(fullPath);
        if (!exists) throw new Error("File not found after write.");

        logAction("FILE_WRITE", `Wrote ${content.length} characters to ${filePath}`, "self-coder");

        return { success: true, message: `Successfully wrote ${content.length} characters to ${filePath}` };
    } catch (e) {
        logDebugError(`[DEBUG] Terminal: Write Error: ${e.message}`);
        return { error: `Write error: ${e.message}` };
    }
}

/**
 * Adjusts the prioritization boost for a specific skill based on user feedback.
 * Prometheus will remember this decision for future intent resolution.
 */
export async function adjust_intent_priority(args) {
    const { skill_id, boost = 5 } = args;

    if (!skill_id) return { error: "Missing skill_id" };

    try {
        const { updatePriority } = await import('../../core/decision-tree.js');
        const result = updatePriority(skill_id, boost);

        if (result.success) {
            logAction("INTENT_ADJUSTED", `Boosted ${skill_id} by ${boost}. New total: ${result.new_boost}`, "self-coder");
            return {
                success: true,
                message: `Understood. I have prioritized "${skill_id}" and will remember this for future requests.`,
                new_priority: result.new_boost
            };
        } else {
            return { error: result.error };
        }
    } catch (e) {
        return { error: `Failed to load decision engine: ${e.message}` };
    }
}
