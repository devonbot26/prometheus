import { Agent } from '../core/agent.js';
import fs from 'fs';
import path from 'path';

async function testPM() {
    console.log("🚀 Starting Project Manager (Niki) Verification Test...\n");

    const rootDir = path.join(process.cwd());
    const handoffPath = path.join(rootDir, 'HANDOFF.json');
    const statePath = path.join(rootDir, 'PM_STATE.json');

    // Clean up previous runs
    if (fs.existsSync(handoffPath)) fs.unlinkSync(handoffPath);
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

    // Initialize Agent
    const niki = new Agent();
    niki.setMode('team-manager');

    console.log(`✅ Mode set to: ${niki.activeMode}`);

    // Simulate User giving a complex plan
    const userPrompt = `
I need you to build a new feature. Here is the plan:
1. Research the API docs.
2. Write the integration code.
3. Test the integration.

Please parse this plan, save it using save_plan, and then get started on the first step by handing off to the coder.
`;

    console.log(`\n🗣️  USER: ${userPrompt}`);
    console.log(`\n🤖 NIKI THINKS...\n`);

    const response = await niki.process(userPrompt);

    console.log(`\n🗣️  NIKI REPLIES:`);
    console.log(response.text);

    console.log("\n\n📊 --- SYSTEM STATE VERIFICATION ---");

    if (fs.existsSync(statePath)) {
        console.log("✅ PM_STATE.json was created successfully.");
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        console.log(`   Steps tracked: ${state.steps.length}`);
    } else {
        console.log("❌ PM_STATE.json was NOT created. (save_plan failed or was not called)");
    }

    if (fs.existsSync(handoffPath)) {
        console.log("✅ HANDOFF.json was created successfully.");
        const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
        console.log(`   Handed off to: ${handoff.to}`);
        console.log(`   Auto-Return configured: ${handoff.return_to === 'team-manager' ? '✅ YES' : '❌ NO'}`);
    } else {
        console.log("❌ HANDOFF.json was NOT created. (handoff_to failed or was not called)");
    }
}

testPM().catch(console.error);
