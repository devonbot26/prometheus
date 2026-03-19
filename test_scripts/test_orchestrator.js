import fs from 'fs';
import { Agent } from '../core/agent.js';

async function runTest() {
    console.log("🔍 Running Lead Researcher Orchestrator Audit...");
    const agent = new Agent();

    // Load the prompt exactly as /file does
    const promptText = fs.readFileSync('prompts/LEAD_RESEARCHER.md', 'utf-8');

    try {
        console.log(`Sending Prompt: \n---\n${promptText.substring(0, 300)}...\n---`);
        const response = await agent.process(promptText);

        console.log("\n✅ Response Received:");
        if (response.reasoning) {
            console.log(`\n[REASONING]\n${response.reasoning}`);
        }
        console.log(`\n[TEXT]\n${response.text}`);

    } catch (e) {
        console.error("❌ Audit Failed:", e);
    }
}

runTest();
