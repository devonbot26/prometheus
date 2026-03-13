
import { projectIndexer } from './services/project-indexer.js';
import { resolveIntent } from './core/decision-tree.js';

async function test() {
    console.log("--- Project Indexer Integration Test ---");

    // 1. Initialize indexer
    await projectIndexer.initialize();

    const projects = projectIndexer.getProjectNames();
    console.log(`✅ Found projects: ${projects.join(', ')}`);

    if (projects.length === 0) {
        console.log("⚠️ No projects found to test.");
        process.exit(0);
    }

    // 2. Test intent resolution
    const testProject = projects[0];
    console.log(`Testing intent for: "${testProject}"`);

    const availableSkills = new Set(['knowledge-base', 'terminal', 'gmail']);
    const topSkills = resolveIntent(`Tell me about ${testProject}`, "", availableSkills);

    console.log(`Top skills: ${JSON.stringify(topSkills)}`);

    if (topSkills.includes('knowledge-base')) {
        console.log("🚀 Verification: PASS");
    } else {
        console.log("❌ Verification: FAIL (knowledge-base not triggered)");
        process.exit(1);
    }
}

test().catch(e => {
    console.error(e);
    process.exit(1);
});
