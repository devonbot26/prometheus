// test-ultra-low-mem.js
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

// 1. Mock the getFreeMemMB function in core/agent.js
// We'll temporarily copy and modify it for testing
const originalAgentContent = readFileSync('core/agent.js', 'utf8');

try {
    const mockedAgentContent = originalAgentContent
        .replace(
            `function getFreeMemMB() {`,
            `function getFreeMemMB() { return 150; // MOCKED ULTRA LOW MEMORY\n`
        );

    writeFileSync('core/agent.js', mockedAgentContent);
    console.log('[TEST] Hooked getFreeMemMB() to return 150MB...');

    // 2. Run the agent via CLI with a simple prompt
    console.log('[TEST] Starting agent. Expecting 🔴 ULTRA-LOW MEMORY warning...');

    // Using stdin to feed a message and then exit
    const result = spawnSync('node', ['prom.js', '--cli'], {
        input: 'hello\n/exit\n',
        encoding: 'utf8',
        env: { ...process.env, DISABLE_COMPRESSED_PROMPT: 'false' }
    });

    const output = result.stdout;

    if (output.includes('ULTRA-LOW MEMORY')) {
        console.log('✅ PASS: Ultra-low memory warning detected in output.');
    } else {
        console.log('❌ FAIL: Warning not found in output.');
        console.log('=== Output Snippet ===');
        console.log(output.substring(0, 1000));
    }

} finally {
    // 3. Restore original file
    writeFileSync('core/agent.js', originalAgentContent);
    console.log('[TEST] Restored core/agent.js');
}
