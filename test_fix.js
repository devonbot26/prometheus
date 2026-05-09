import { routeRequest } from './core/port-router.js';
import { terminal_run } from './skills/terminal/bridge.js';
import assert from 'assert';

async function testFix() {
    console.log('🧪 Testing routing logic...');
    const res1 = routeRequest('Fix the bug in the code', 'devon');
    console.log('Routing for "Fix the bug":', res1);
    assert(res1.port === 18888, 'Should route to reasoner for non-matched tasks.');

    const res2 = routeRequest('What is the weather?', 'devon');
    console.log('Routing for "weather":', res2);
    // Based on the code, if no success story matches, it should be 18888. 
    // Unless short and nonquery? "What is the weather?" is > 15 chars and has '?'.
    
    console.log('🧪 Testing terminal skill ReferenceError fix (mock spawn)...');
    try {
        // We just want to check if the function can be called without errors and if imports work.
        // We won't actually spawn a long process here, just verify it initializes.
        const proc = terminal_run({ command: 'echo "hello"' });
        console.log('✅ Terminal run call initiated successfully.');
        const result = await proc;
        console.log('Terminal result:', result.output);
    } catch (e) {
        console.error('❌ Terminal skilled failed:', e);
    }
}

testFix().catch(console.error);
