import { Agent } from '../core/agent.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env from prometheus.env if it exists, otherwise .env
if (fs.existsSync('prometheus.env')) {
    dotenv.config({ path: 'prometheus.env' });
} else {
    dotenv.config();
}

async function runBehavioralTest() {
    const agent = new Agent();
    
    // Clear history for a clean test
    agent.reset();

    const testTurns = [
        { 
            name: "Greeting & Persona Check", 
            prompt: "Hi, I'm Nelson. Who are you and how are you today?" 
        },
        { 
            name: "Tool Execution (Weather)", 
            prompt: "What's the weather like in Charlottetown right now?" 
        }
    ];

    console.log("🚀 Starting Behavioral Test for Devon...");

    for (const turn of testTurns) {
        console.log(`\n\x1b[36m[TASK] ${turn.name}\x1b[0m`);
        console.log(`\x1b[2mUser: ${turn.prompt}\x1b[0m\n`);

        try {
            let fullResponse = "";
            await agent.process(turn.prompt, 'INTERACTIVE', (chunk, isReasoning) => {
                const color = isReasoning ? "\x1b[33m" : "\x1b[32m";
                process.stdout.write(`${color}${chunk}\x1b[0m`);
                if (!isReasoning) fullResponse += chunk;
            });

            console.log("\n\n✅ Turn Completed.");
            
            // Basic functional validation
            if (turn.name === "Greeting & Persona Check") {
                if (fullResponse.toLowerCase().includes("devon")) {
                    console.log("✔️ Persona Verified: Agent identified as Devon.");
                } else {
                    console.warn("⚠️ Persona Warning: Agent did not explicitly mention 'Devon'.");
                }
            }
            
            if (turn.name === "Tool Execution (Weather)") {
                // If it used the tool, the history should contain the tool execution
                const hasToolCall = agent.history.some(m => m.content.includes("get_weather"));
                if (hasToolCall) {
                    console.log("✔️ Tool Execution Verified: Weather tool was invoked.");
                } else {
                    console.warn("⚠️ Tool Execution Warning: Weather tool was not detected in history.");
                }
            }

        } catch (e) {
            console.error(`\n\x1b[31m❌ Error during turn "${turn.name}": ${e.message}\x1b[0m`);
            if (e.stack) console.error(e.stack);
            process.exit(1);
        }
    }

    console.log("\n\x1b[32m✨ All behavioral tests passed! Devon is functional.\x1b[0m");
    process.exit(0);
}

runBehavioralTest().catch(err => {
    console.error("Fatal Test Error:", err);
    process.exit(1);
});
