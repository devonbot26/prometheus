import { exec } from 'child_process';

/**
 * Execute a shell command
 * @param {object} args - { command: string }
 * @returns {Promise<object>} - { output, error }
 */
export function terminal_run(args) {
    return new Promise((resolve, reject) => {
        if (!args.command) {
            return resolve({ error: "No command provided" });
        }

        console.log(`> Executing: ${args.command}`);

        exec(args.command, { cwd: process.env.HOME }, (error, stdout, stderr) => {
            if (error) {
                // Return error as result so the LLM sees it
                return resolve({
                    exitCode: error.code,
                    error: stderr || error.message,
                    output: stdout
                });
            }

            resolve({
                exitCode: 0,
                output: stdout,
                error: stderr ? stderr : null
            });
        });
    });
}
