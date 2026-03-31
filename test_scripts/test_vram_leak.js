import { terminal_run } from '../skills/terminal/bridge.js';

async function testEscape() {
    console.log("🧪 Testing terminal_run abort mechanism...");
    const ac = new AbortController();
    
    // Fire off a 10-second sleep, but abort after 2 seconds
    const promise = terminal_run({ command: 'sleep 10' }, { abortSignal: ac.signal });
    
    setTimeout(() => {
        console.log("🛑 Sending abort signal...");
        ac.abort();
    }, 2000);

    const result = await promise;
    console.log("✅ Result returned:", result);
    
    console.log("🔍 Checking if sleep process is still running...");
    try {
        const { execSync } = await import('child_process');
        const processes = execSync('ps aux | grep "sleep 10" | grep -v grep').toString();
        // The script itself will appear if we aren't careful, but grep -v grep helps.
        // Actually, if it's there, it will print.
        console.log(`❌ FAILED: sleep is still running:\n${processes}`);
    } catch (e) {
        // grep returns exit code 1 if no matches found
        console.log("✅ SUCCESS: The sleep process is completely gone.");
    }
}

testEscape();
