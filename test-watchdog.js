const { Agent } = require('./core/agent.js');
const fs = require('fs');
const path = require('path');

async function testWatchdog() {
    console.log("Starting Stream Watchdog Verification...");
    const agent = new Agent();

    // Mock the chat function to simulate a repeating stream
    const llm = require('./core/llm.js');
    const originalChat = llm.chat;

    llm.chat = async (messages, options) => {
        if (options.onToken) {
            console.log("[MOCK] Simulating repeating stream...");
            for (let i = 0; i < 10; i++) {
                if (options.signal && options.signal.aborted) {
                    console.log("[MOCK] Signal ABORTED detected!");
                    throw { name: 'AbortError' };
                }
                options.onToken("Wait, I need to check the constraint. ", false);
                await new Promise(r => setTimeout(r, 10));
            }
        }
        return { text: "Simulated completion" };
    };

    try {
        console.log("Sending 'hi' to trigger watchdog...");
        const response = await agent.process("hi");
        console.log("Final Agent Response:", response.text);

        if (response.text.includes("repetition loop detected")) {
            console.log("\n✅ [SUCCESS] Watchdog caught the simulated loop!");
        } else {
            console.log("\n❌ [FAILURE] Watchdog failed to catch the loop.");
        }
    } catch (e) {
        console.error("Test Error:", e);
    } finally {
        llm.chat = originalChat;
    }
}

testWatchdog();
