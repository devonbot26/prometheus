/**
 * Self-Coder Skill
 * Allows Prometheus to write and install new skills.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prompt } from '../../core/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = path.resolve(__dirname, '../../skills');
const STAGING_ROOT = path.resolve(__dirname, '../../skills/_staging');

// Ensure staging directory exists
if (!fs.existsSync(STAGING_ROOT)) {
    fs.mkdirSync(STAGING_ROOT, { recursive: true });
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
