/**
 * Self-Coder Skill
 * Allows Prometheus to write and install new skills.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { prompt } from '../../core/llm.js';

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

export async function create_draft_skill(args) {
    const { name, description, code_js, tool_spec } = args;

    if (!name || !code_js || !tool_spec) {
        return { error: 'Name, code_js, and tool_spec are required.' };
    }

    // Sanitize name
    const cleanName = name.replace(/[^a-z0-9-]/g, '').toLowerCase();
    const skillDir = path.join(STAGING_ROOT, cleanName);

    try {
        if (!fs.existsSync(skillDir)) {
            fs.mkdirSync(skillDir, { recursive: true });
        }

        // Write index.js
        fs.writeFileSync(path.join(skillDir, 'index.js'), code_js);

        // create skill.json
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

        autoCommit(skillDir, `feat(self-coder): draft skill "${cleanName}"`);

        console.log(`📝 Drafted skill "${cleanName}" in staging.`);
        return {
            success: true,
            message: `Skill "${cleanName}" drafted successfully in _staging/ folder. Please review it before installing.`
        };
    } catch (e) {
        console.error('Draft error:', e);
        return { error: e.message };
    }
}

export async function install_skill(args) {
    const { name } = args;
    const cleanName = name.replace(/[^a-z0-9-]/g, '').toLowerCase();

    const stagingPath = path.join(STAGING_ROOT, cleanName);
    const installPath = path.join(SKILLS_ROOT, cleanName);

    if (!fs.existsSync(stagingPath)) {
        return { error: `Skill "${cleanName}" not found in staging.` };
    }

    try {
        if (fs.existsSync(installPath)) {
            return { error: `Skill "${cleanName}" already exists in active skills.` };
        }

        // Move directory
        fs.renameSync(stagingPath, installPath);

        console.log(`🚀 Installed skill "${cleanName}"! Restart required.`);
        return {
            success: true,
            message: `Skill "${cleanName}" installed. Please restart Prometheus to activate it.`
        };
    } catch (e) {
        console.error('Install error:', e);
        return { error: e.message };
    }
}

export async function consult_senior_dev(args) {
    const { prompt: userPrompt } = args;
    console.log('🤖 Consulting Senior Dev (Gemini)...');

    // System instruction injected into prompt
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
        const result = await prompt(enhancedPrompt, { temperature: 0.2, maxTokens: 4000 });
        let jsonStr = result.text.trim();

        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const skillData = JSON.parse(jsonStr);

        // Auto-draft the skill
        console.log(`📝 Auto-drafting skill: ${skillData.name}`);
        const draftResult = await create_draft_skill(skillData);

        if (draftResult.success) {
            return {
                success: true,
                advice: `I have successfully drafted the skill "${skillData.name}"!\n\nDescription: ${skillData.description}\n\nYou can now ask the user: "I drafted the ${skillData.name} skill. Do you want me to install it?"`,
                model: result.model
            };
        } else {
            return { error: `Failed to draft skill: ${draftResult.error}` };
        }

    } catch (e) {
        return { error: `Senior Dev error: ${e.message}` };
    }
}

export async function switch_model(args) {
    const { model } = args;
    console.log(`🧠 Switching model brain to: ${model}`);

    try {
        let modelFile = null;
        let responseMsg = "";

        if (model === 'local' || model === 'qwen') {
            modelFile = "qwen2.5-7b-instruct-q4_k_m.gguf";
            responseMsg = "Switched to Local (Qwen 7B) model.";
            setModelOverride('local');
        } else if (model === 'deepseek' || model === 'thinker') {
            modelFile = "DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf";
            responseMsg = "Switched to DeepSeek-Coder-V2 (MoE 16B). I am now thinking deeply.";
            setModelOverride('local'); // Still local, but different model
        } else if (model === 'gemini' || model === 'flash') {
            responseMsg = "Switched to Gemini Flash Cloud.";
            setModelOverride('gemini');
        } else {
            setModelOverride(null);
            responseMsg = "Reset to default behavior.";
        }

        // If we have a model file, tell the parent manager (prom.js) to restart the llama server
        if (modelFile && process.send) {
            process.send({ type: 'RESTART_LLAMA', model: modelFile });
        }

        return { success: true, message: responseMsg };
    } catch (e) {
        return { error: e.message };
    }
}

export async function read_file(args) {
    const { file_path } = args;
    const fullPath = path.resolve(process.cwd(), file_path);

    if (!fs.existsSync(fullPath)) {
        return { error: `File not found: ${file_path}` };
    }

    try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        // Safety: Limit large file reads to first 500 lines to preserve context window
        if (lines.length > 500) {
            return {
                warning: 'File truncated to first 500 lines.',
                content: lines.slice(0, 500).join('\n'),
                total_lines: lines.length
            };
        }

        return { content };
    } catch (e) {
        return { error: `Read error: ${e.message}` };
    }
}

export async function apply_patch(args) {
    const { file_path, target_content, replacement_content } = args;
    const fullPath = path.resolve(process.cwd(), file_path);

    if (!fs.existsSync(fullPath)) {
        return { error: `File not found: ${file_path}` };
    }

    try {
        let content = fs.readFileSync(fullPath, 'utf-8');

        // Normalize line endings is hard without a library, so we rely on exact match for now.
        // We trim only if strict match fails to be helpful.
        if (content.includes(target_content)) {
            const newContent = content.replace(target_content, replacement_content);
            fs.writeFileSync(fullPath, newContent);

            // Mandatory verification: re-read and confirm
            const verifyContent = fs.readFileSync(fullPath, 'utf-8');
            const verified = verifyContent.includes(replacement_content);

            autoCommit(fullPath, `fix(self-coder): patch ${path.basename(file_path)}`);

            if (!verified) {
                return {
                    success: false,
                    error: 'VERIFICATION FAILED: Patch was written but replacement content not found on re-read. File may be corrupted.'
                };
            }

            return {
                success: true,
                verified: true,
                message: `Successfully patched and verified ${file_path}`
            };
        } else {
            return {
                success: false,
                error: 'Target content not found in file. Please ensure exact match including whitespace.'
            };
        }
    } catch (e) {
        return { error: `Patch error: ${e.message}` };
    }
}
