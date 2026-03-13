import { spawn } from 'child_process';
import { logDebug } from '../../core/logger.js';

/**
 * Execute a shell command with real-time streaming
 * @param {object} args - { command: string }
 * @param {object} options - { onStream: function }
 * @returns {Promise<object>} - { output, error, exitCode }
 */
export function terminal_run(args, options = {}) {
    return new Promise((resolve) => {
        if (!args.command) {
            return resolve({ error: "No command provided" });
        }

        const { onStream } = options;
        let command = args.command;

        const sendActivity = () => {
            if (process.send && process.connected) {
                try {
                    process.send({ type: 'ACTIVITY' });
                } catch (e) { /* ignore */ }
            }
        };

        const activityInterval = setInterval(sendActivity, 30000);

        // Auto-fix: pyenv on macOS doesn't alias 'python' to 'python3'
        if (/^python\s/.test(command) || command === 'python') {
            command = command.replace(/^python/, 'python3');
        }

        // Safety Guard: Force depth limits and exclusions on broad searches
        if (/^(find|du)\s/.test(command)) {
            const forbidden = ['/System', '/Library', '/Volumes', '.Trashes'];
            const needsPrune = !command.includes('-prune');
            if (needsPrune && (command.includes(' ~') || command.includes(' /'))) {
                const pruneArgs = forbidden.map(p => `-path "${p}" -prune`).join(' -o ');
                command = command.replace(/^(find|du)/, `$1 . \\( ${pruneArgs} -o -print \\)`);
                logDebug(`🛡️ SafePath: Modified command to exclude system folders.`);
            }
        }

        logDebug(`> Spawning: ${command}`);

        // Use shell: true to handle pipes and complex commands easily
        // Use HOME as cwd as per Prometheus convention
        const cp = spawn(command, {
            shell: true,
            cwd: process.env.HOME,
            env: { ...process.env, PAGER: 'cat' } // Prevent interactive pagers
        });


        let output = '';
        let errorOutput = '';

        const sanitize = (text) => {
            // Noise Filter: Remove permission denied lines
            const lines = text.split('\n');
            const cleanLines = lines.filter(line => 
                !line.includes('Permission denied') && 
                !line.includes('Operation not permitted')
            );
            return cleanLines.join('\n');
        };

        cp.stdout.on('data', (data) => {
            let chunk = sanitize(data.toString());
            if (!chunk && data.toString().length > 0) return; // All filtered

            // Prevent OOM by capping accumulated memory to last 2MB
            if (output.length > 2000000) {
                output = output.substring(output.length - 1000000);
            }
            output += chunk;
            sendActivity();
            if (onStream) onStream(chunk);
        });

        cp.stderr.on('data', (data) => {
            let chunk = sanitize(data.toString());
            if (!chunk && data.toString().length > 0) return;

            if (errorOutput.length > 2000000) {
                errorOutput = errorOutput.substring(errorOutput.length - 1000000);
            }
            errorOutput += chunk;
            sendActivity();
            if (onStream) onStream(chunk); // Stream errors too
        });

        cp.on('close', async (code) => {
            clearInterval(activityInterval);

            // Cap the final output for LLM context safety (Lesson #3)
            let finalOutput = output.trim();
            let finalError = errorOutput.trim();
            const MAX_LLM_CHARS = 4000;

            // Phase 35: Shadow Buffers (Context Size Optimization)
            const outputSize = finalOutput.length;
            if (outputSize > 8000) {
                const bufferId = `buffer_${Date.now()}`;
                const bufferDir = path.join(process.cwd(), 'logs', 'shadow_buffers');
                const fs = await import('fs');
                if (!fs.existsSync(bufferDir)) fs.mkdirSync(bufferDir, { recursive: true });
                
                const bufferPath = path.join(bufferDir, `${bufferId}.txt`);
                fs.writeFileSync(bufferPath, finalOutput);
                
                const snippet = finalOutput.substring(0, 1000) + `\n\n... [TRUNCATED - ${outputSize - 2000} chars hidden] ...\n\n` + finalOutput.substring(outputSize - 1000);
                finalOutput = `${snippet}\n\n> [!SYSTEM]: This output is too large for context (${outputSize} bytes). Full content saved to Shadow Buffer: **${bufferId}**. Use 'peek_buffer' tool to read specific parts.`;
            }

            resolve({
                exitCode: code,
                output: finalOutput,
                error: code !== 0 ? (finalError || `Exit code ${code}`) : (finalError || null)
            });
        });

        cp.on('error', (err) => {
            clearInterval(activityInterval);
            resolve({
                exitCode: 1,
                error: err.message,
                output: output
            });
        });
    });
}
/**
 * Reads a specific chunk from a shadow buffer file.
 */
export async function peek_buffer({ buffer_id, start_line, lines }) {
    return new Promise(async (resolve) => {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const bufferPath = path.join(process.cwd(), 'logs', 'shadow_buffers', `${buffer_id}.txt`);
            
            if (!fs.existsSync(bufferPath)) {
                return resolve({ error: `Buffer ${buffer_id} not found.` });
            }
            
            const content = fs.readFileSync(bufferPath, 'utf-8');
            const allLines = content.split('\n');
            const chunk = allLines.slice(start_line - 1, start_line - 1 + Math.min(lines, 500));
            
            resolve({
                output: `--- [BUFFER PEEK: ${buffer_id} | Lines ${start_line} to ${start_line + chunk.length - 1} of ${allLines.length}] ---\n${chunk.join('\n')}\n--- [END PEEK] ---`
            });
        } catch (e) {
            resolve({ error: `Failed to read buffer: ${e.message}` });
        }
    });
}
