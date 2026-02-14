/**
 * Self-Coder Skill
 * Allows Prometheus to write and install new skills.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
