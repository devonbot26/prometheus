import { Agent } from './core/agent.js';

async function verifySkill() {
    console.log("🔍 Verifying hermes-agent skill registration...");
    const agent = new Agent();
    
    const summaries = agent.allSkillSummaries || "";
    if (summaries.includes("hermes-agent")) {
        console.log("✅ hermes-agent skill successfully loaded and summarized.");
        process.exit(0);
    } else {
        console.error("❌ hermes-agent skill NOT found in summaries.");
        console.log("Current summaries:", summaries);
        process.exit(1);
    }
}

verifySkill().catch(err => {
    console.error(err);
    process.exit(1);
});
