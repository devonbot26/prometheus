/**
 * Prometheus Skill Loader
 * Scans the skills/ directory and dynamically loads each skill module.
 * 
 * Each skill folder must contain a `skill.json` with:
 *   { "name": "...", "description": "...", "tools": { ... } }
 * 
 * And an entry file (defined in skill.json or default `index.js`)
 * that exports functions matching the tool names.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

/**
 * Load all skills from the skills directory
 * @returns {Map<string, {meta: object, tools: object}>}
 */
export function loadSkills() {
    const skills = new Map();

    if (!fs.existsSync(SKILLS_DIR)) {
        console.warn('⚠️ Skills directory not found:', SKILLS_DIR);
        return skills;
    }

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

        const skillDir = path.join(SKILLS_DIR, entry.name);
        const manifestPath = path.join(skillDir, 'skill.json');

        // Check for skill.json
        if (!fs.existsSync(manifestPath)) {
            console.warn(`⚠️ Skipping ${entry.name}: no skill.json`);
            continue;
        }

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            const toolNames = Object.keys(manifest.tools || {});

            if (toolNames.length === 0) {
                console.warn(`⚠️ Skipping ${entry.name}: no tools defined`);
                continue;
            }

            skills.set(manifest.name || entry.name, {
                meta: manifest,
                dir: skillDir,
                toolNames
            });

            console.log(`📄 Registered summary for: ${manifest.name} (${toolNames.join(', ')})`);
        } catch (e) {
            console.error(`❌ Failed to load skill ${entry.name}:`, e.message);
        }
    }

    return skills;
}

/**
 * Execute a tool from a loaded skill
 * @param {Map} skills - loaded skills map
 * @param {string} toolName - e.g. "gmail_scan"
 * @param {object} args - tool arguments
 * @returns {Promise<any>}
 */
export async function executeTool(skills, toolName, args = {}) {
    for (const [name, skill] of skills) {
        if (skill.toolNames.includes(toolName)) {
            const toolDef = skill.meta.tools[toolName];
            const modulePath = path.join(skill.dir, toolDef.path || 'index.js');

            // Dynamic import (supports both ESM and CJS via .cjs)
            const mod = await import(modulePath);
            const fn = mod[toolDef.function || toolName] || mod.default?.[toolName];

            if (typeof fn !== 'function') {
                throw new Error(`Tool "${toolName}" not found as export in ${modulePath}`);
            }

            console.log(`🔧 Running ${name}/${toolName}...`);
            return await fn(args);
        }
    }

    // Check if toolName is actually a skill name
    if (skills.has(toolName)) {
        const skill = skills.get(toolName);
        throw new Error(`"${toolName}" is a skill name, not a tool name. Available tools in this skill: ${skill.toolNames.join(', ')}`);
    }

    // DEBUG: If we reach here, it really is unknown. Log keys.
    console.error(`❌ Tool Resolution Failed: "${toolName}". Available Skill Keys:`, [...skills.keys()]);

    throw new Error(`Unknown tool: ${toolName}`);
}

/**
 * Get a formatted list of all available tools (for LLM system prompt)
 */
export function getToolDescriptions(skills) {
    const descriptions = [];
    for (const [name, skill] of skills) {
        for (const toolName of skill.toolNames) {
            const tool = skill.meta.tools[toolName];
            const params = tool.parameters
                ? Object.entries(tool.parameters).map(([k, v]) => `${k}: ${v.type}${v.required ? ' (required)' : ''}`).join(', ')
                : 'none';
            descriptions.push(`- ${toolName}: ${tool.description} [params: ${params}]`);
        }
    }
    return descriptions.join('\n');
}

/**
 * Get high-level summaries of all skills
 */
export function getSkillSummaries(skills) {
    const summaries = [];
    for (const [name, skill] of skills) {
        summaries.push(`- ${name}: ${skill.meta.description || 'No description'} [tools: ${skill.toolNames.join(', ')}]`);
    }
    return summaries.join('\n');
}

/**
 * Get full tool descriptions for a specific set of skills
 * @param {Map} skills - loaded skills map
 * @param {string[]} skillNames - list of skills to get tools for
 */
export function getToolDescriptionsForSkills(skills, skillNames) {
    const descriptions = [];
    for (const name of skillNames) {
        const skill = skills.get(name);
        if (!skill) continue;

        for (const toolName of skill.toolNames) {
            const tool = skill.meta.tools[toolName];
            const params = tool.parameters
                ? Object.entries(tool.parameters).map(([k, v]) => `${k}: ${v.type}${v.required ? ' (required)' : ''}`).join(', ')
                : 'none';
            descriptions.push(`- ${toolName}: ${tool.description} [params: ${params}]`);
        }
    }
    return descriptions.join('\n');
}
