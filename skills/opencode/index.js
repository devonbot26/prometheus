import { execSync } from 'child_process';
import * as fs from 'fs';
import path from 'path';

/**
 * Handoff a complex coding task to OpenCode.
 * @param {Object} params
 * @param {string} params.prompt - Detailed coding instructions.
 * @param {string} [params.project_path] - Root directory of the target project.
 * @param {string} [params.model] - Optional model identifier (provider/model).
 */
export async function handoff_to_opencode({ prompt, project_path, model }) {
    console.log(`\n🚀 [Cross-Agent] Handing off to OpenCode...`);

    // Default to current project if not specified
    const targetDir = project_path || process.cwd();

    // Resolve the OpenCode binary dynamically (prefer system PATH, fallback to known paths)
    let opencodeBin = 'opencode'; // Use PATH-based resolution first
    try {
        const { execSync: resolve } = await import('child_process');
        opencodeBin = resolve('which opencode', { encoding: 'utf-8' }).trim();
    } catch (e) {
        // Fallbacks in order of preference
        const fallbacks = [
            `${process.env.HOME}/.antigravity/antigravity/bin/opencode`,
            '/Users/nelsonwong/.antigravity/antigravity/bin/opencode',
            `${process.env.HOME}/Documents/projects/opencode-ai-lab/node_modules/opencode-darwin-arm64/bin/opencode`
        ];
        for (const fb of fallbacks) {
            if (fs.existsSync(fb)) { opencodeBin = fb; break; }
        }
    }

    // Default model if none provided
    const targetModel = model || 'opencode/minimax-m2.5-free';

    // Construct command
    let command = `${opencodeBin} run "${prompt.replace(/"/g, '\\"')}" --model ${targetModel}`;

    try {
        console.log(`⚙️ Running: ${command} in ${targetDir}`);

        // Execute and capture output
        // Note: Using execSync for simplicity in this bridge, 
        // though async exec would be better for long-running tasks.
        const output = execSync(command, {
            cwd: targetDir,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            env: { ...process.env, FORCE_COLOR: '0' }
        });

        return {
            success: true,
            output: output,
            message: "OpenCode successfully completed the task."
        };
    } catch (error) {
        console.error(`❌ OpenCode Handoff Failed:`, error.message);
        return {
            success: false,
            error: error.message,
            output: error.stdout || error.stderr,
            message: "OpenCode encountered an error or failed to complete."
        };
    }
}
