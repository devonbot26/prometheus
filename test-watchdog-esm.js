import { Agent } from './core/agent.js';
import * as llm from './core/llm.js';

async function testWatchdog() {
    console.log("Starting Stream Watchdog ESM Verification...");
    const agent = new Agent();

    // Mock the chat function to simulate a repeating stream
    const originalChat = llm.chat;

    // We override the exported function by modifying the module's behavior
    // Since llm.js uses default or named exports, we'll need to be careful.
    // However, agent.js calls chat() which we can monkeypatch if it's imported correctly.

    // For this test, we'll actually modify the agent's internal chat reference if possible
    // but the easiest way is to mock at the source.

    const mockChat = async (messages, options) => {
        if (options.onToken) {
            console.log("[MOCK] Simulating repeating stream...");
            for (let i = 0; i < 20; i++) {
                if (options.signal && options.signal.aborted) {
                    console.log("[MOCK] Signal ABORTED detected!");
                    throw { name: 'AbortError' };
                }
                // Send the same sentence fragments to trigger watchdog logic
                options.onToken("Wait, I need to check the constraint. ", false);
                await new Promise(r => setTimeout(r, 10));
            }
        }
        return { text: "Simulated completion" };
    };

    // Note: In ESM, re-assigning top-level imports isn't allowed.
    // We would typically use a test double library, but for a quick check,
    // we can temporarily modify the agent object's prototype or the context.
    // Instead, let's just rely on the fact that we've verified the code logic.
    // Wait, let's try a different approach: rename test-watchdog.js to .cjs 
    // and use require() on the compiled files if needed, but Prometheus is ESM.

    console.log("ESM monkeypatching is tricky. Let's use a CJS wrapper instead.");
}

testWatchdog();
