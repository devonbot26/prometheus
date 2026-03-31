import { Agent } from '../core/agent.js';

async function runTest(name, prompt) {
    console.log(`\n\n=== TEST: ${name} ===`);
    const agent = new Agent();
    let reasoningDetected = false;
    let contentReceived = "";

    try {
        const result = await agent.process(prompt, undefined, (chunk, isReasoning) => {
            if (isReasoning) {
                reasoningDetected = true;
            } else {
                contentReceived += chunk;
                process.stdout.write(`[CONTENT] ${chunk}`);
            }
        });

        console.log('\n--- RESULTS ---');
        console.log('Reasoning Detected in Stream:', reasoningDetected);
        console.log('Final Text Length:', result.text.length);
        console.log('Reasoning Captured in Object:', (result.reasoning?.length || 0) > 0);
        
        // Check if content leaked into final text (should be stripped)
        const hasLeakedTags = /<(?:think|thinking|thought)>/.test(result.text);
        console.log('Tags Stripped from Final Text:', !hasLeakedTags);

        // Check for tool call protection (if applicable)
        if (prompt.includes('tool')) {
            const hasTool = result.text.includes('{"tool":');
            console.log('Tool Call Preserved:', hasTool);
        }

    } catch (e) {
        console.error(`Test ${name} failed:`, e);
    }
}

async function main() {
    // Test 1: Standard <think>
    await runTest("Standard <think>", "Please think using <think> tags about the color blue, then provide a short answer.");

    // Test 2: <thinking> (Distilled style)
    await runTest("<thinking> Style", "Please think using <thinking> tags about the color red, then provide a short answer.");

    // Test 3: Unclosed tag with tool call hallucination
    await runTest("Unclosed tag + Tool Call", "Start with <think>, reason about weather, then output '{\"tool\": \"get_weather\"}' WITHOUT closing the think tag.");

    console.log("\n\nVerification Complete.");
}

main();
