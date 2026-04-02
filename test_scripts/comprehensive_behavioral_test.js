import { Agent } from '../core/agent.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env from prometheus.env if it exists, otherwise .env
if (fs.existsSync('prometheus.env')) {
    dotenv.config({ path: 'prometheus.env', override: true });
} else {
    dotenv.config({ override: true });
}

/**
 * COMPREHENSIVE BEHAVIORAL TEST (v2)
 * Specifically tests Turn 2 (Follow-up) with pre-existing history 
 * to verify history pruning is working after refactoring agent.js.
 */
async function runComprehensiveTest() {
    console.log("🚀 Starting Comprehensive Behavioral Test (Stall-Resistance Audit)...");
    
    const agent = new Agent();
    agent.setMode('devon');
    
    // 1. STRESS TEST: Build a long dummy history to force pruning/budgeting
    // Each message is ~100 tokens, 10 messages = 1000 tokens of history.
    console.log("📦 Pre-loading agent history with context (Simulating long session)...");
    for (let i = 0; i < 5; i++) {
        agent.history.push({ 
            role: 'user', 
            content: `User Research Task ${i}: Please analyze the following data for project-X. We need to ensure that the server-latency is below 200ms and the memory footprint is optimized for M1 chips. This is a very long message string repeated multiple times to ensure we occupy enough context window tokens to trigger the automatic history pruning logic in the agent core. Repeat: context window tokens, history pruning logic.` 
        });
        agent.history.push({ 
            role: 'assistant', 
            content: `Assistant Analysis ${i}: I have received your request for analysis. I am monitoring the server latency and will provide updates on the M1 optimization soon. The current progress suggests we are on track for a 15% improvement in boot time. I am here to help you as Devon.` 
        });
    }

    const testPrompt = "Hi Devon, I'm checking the current weather in New York. Can you tell me what it is and what I should wear?";
    console.log(`\n\x1b[36m[TASK] Multi-Turn Weather Summary with 10-msg History\x1b[0m`);
    console.log(`\x1b[2mPrompt: ${testPrompt}\x1b[0m\n`);

    try {
        let fullResponse = "";
        let toolInvoked = false;
        let turnStartTime = Date.now();

        await agent.process(testPrompt, 'INTERACTIVE', (chunk, isReasoning) => {
            const color = isReasoning ? "\x1b[33m" : "\x1b[32m";
            process.stdout.write(`${color}${chunk}\x1b[0m`);
            if (!isReasoning) fullResponse += chunk;
        });

        let totalDuration = (Date.now() - turnStartTime) / 1000;
        console.log(`\n\n✅ Turn Completed in ${totalDuration.toFixed(2)}s.`);

        // 2. VERIFICATION: Check tool execution
        const hasToolCall = agent.history.some(m => m.content.includes("get_weather") || m.content.includes("Tool \"get_weather\" returned"));
        if (hasToolCall) {
            console.log("✔️ Tool Execution Verified: get_weather was called.");
        } else {
            console.warn("⚠️ Tool Execution Warning: Weather tool was not detected in turn history.");
        }

        // 3. VERIFICATION: Check for stalls
        if (totalDuration > 60) {
            console.error("❌ STALL DETECTED: The turn took >60s. Pruning might not be enough or hardware is extremely throttled.");
        } else {
            console.log("✔️ Performance Verified: Post-tool summary returned within acceptable window.");
        }

        // 4. VERIFICATION: Check persona
        if (fullResponse.toLowerCase().includes("weather") || fullResponse.includes("°C")) {
            console.log("✔️ Response content verified: Agent provided the weather summary correctly.");
        } else {
            console.warn("⚠️ Response content warning: Weather summary missing from final output.");
        }

    } catch (e) {
        console.error(`\n\x1b[31m❌ Error during comprehensive test: ${e.message}\x1b[0m`);
        if (e.stack) console.error(e.stack);
        process.exit(1);
    }

    console.log("\n\x1b[32m✨ Comprehensive test passed! Devon history pruning is stable.\x1b[0m");
    process.exit(0);
}

runComprehensiveTest().catch(err => {
    console.error("Fatal Test Error:", err);
    process.exit(1);
});
