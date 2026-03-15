/**
 * Headless Management Script: Niki (Team Manager)
 * Directly processes the Supervisor Override to close the project.
 */

import { Agent } from '../core/agent.js';
import fs from 'fs';
import path from 'path';

async function runNiki() {
    console.log('🤖 Starting Headless Niki Management...');
    const agent = new Agent();
    agent.activeMode = 'team-manager'; // Set directly to avoid auto-detections
    
    // Minimal prompt to save tokens
    const prompt = `DRIVE VERIFICATION FOCUS:
1. Use 'drive_list' for '/Prometheus_Test_Folder'.
2. Use 'drive_peek' on the file found.
3. Update PM_STATE.json to 'Completed' and close.`;

    try {
        console.log('🧠 Niki is thinking...');
        const result = await agent.process(prompt, undefined, (chunk, isReasoning) => {
            if (isReasoning) process.stdout.write(chunk);
        });

        console.log('\n\n✅ Niki Response:');
        console.log(result.text);

        if (result.auto_continue) {
            console.log('\n🔄 Handoff detected. Project state should be updated.');
        }

    } catch (e) {
        console.error('❌ Error during Niki management:', e);
    }
}

runNiki();
