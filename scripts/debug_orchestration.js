import 'dotenv/config';
import { Agent } from '../core/agent.js';

async function debugFlow() {
    const agent = new Agent();
    agent.activeMode = 'primary';
    
    const userPrompt = "Niki, Objective: Implement Enhanced Google Drive Skill (Multi-Agent Flow) Initialize: Use query_knowledge to read the blueprint at research/implementation_plan_google_drive.md . Team Setup: As Niki (team-manager), use the save_plan tool to convert that blueprint into a structured task list in PM_STATE.json. Architect Phase: Immediately use handoff_to with the role team-architect to begin Phase 49: Step 1 (PathResolver). Brain Check: I expect you (Niki) to run on the Qwen 9B brain, then auto-swap the Architect to the DeepSeek Uncensored brain once the handoff is initiated. Execution: The Architect should design the logic and then hand off to the team-coder (running on Qwen Coder) for implementation. Goal: A functional hierarchy-aware Google Drive skill with context-safe \"peeking.\"";

    console.log('--- STARTING PROCESS ---');
    try {
        // We catch the internal state changes
        const res = await agent.process(userPrompt);
        console.log('\n--- AGENT RESPONSE ---');
        console.log(res.text);
        console.log('\n--- FINAL MODE ---');
        console.log(agent.activeMode);
        
        const hasTool = res.text.includes('{') && res.text.includes('tool');
        console.log(`\nTool Call Detected: ${hasTool}`);
        
    } catch (e) {
        console.error('CRASH:', e);
    }
}

debugFlow();
