import { spawn } from 'child_process';
import path from 'path';

/**
 * Web Search Skill Bridge
 * Uses the local 'my_ai_assistant' search script for non-API searching.
 */
const VENV_PYTHON = path.join(process.env.HOME, 'Documents/projects/my_ai_assistant/venv/bin/python');
const SEARCH_SCRIPT = path.join(process.env.HOME, 'Documents/projects/my_ai_assistant/web_search.py');

export async function web_search(args) {
    const { query } = args;

    console.log(`[DEBUG] Attempting NON-API web search (via my_ai_assistant) for: "${query}"`);

    return new Promise((resolve, reject) => {
        const proc = spawn(VENV_PYTHON, [SEARCH_SCRIPT, query]);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });

        proc.on('close', (code) => {
            if (code !== 0) {
                console.error(`❌ Search Script Error (Exit ${code}): ${stderr}`);
                return reject(new Error("Web search tool failed."));
            }

            // The python script prints results to stdout. 
            // We'll return it as the 'output' field.
            resolve({
                success: true,
                output: stdout || "No results found.",
                sources: []
            });
        });
    });
}
