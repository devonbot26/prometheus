import { save_knowledge, query_knowledge } from './skills/knowledge-base/index.js';
import { create_draft_skill, install_skill } from './skills/self-coder/index.js';

async function testKnowledgeBase() {
    console.log('--- Testing Knowledge Base (RAG) ---');

    // Save a unique fact
    const fact = "The secret launch code for project Prometheus is 'Blue-Horizon-7'.";
    const topic = "Project Details";

    console.log(`💾 Saving: "${fact}"`);
    await save_knowledge({ text: fact, topic });

    // Query it back
    const query = "What is the secret launch code?";
    console.log(`🔍 Querying: "${query}"`);

    const result = await query_knowledge({ query });
    console.log('📝 Result:', JSON.stringify(result, null, 2));

    if (result.found && result.results[0].text.includes('Blue-Horizon-7')) {
        console.log('✅ Knowledge Base Test Passed!');
    } else {
        console.error('❌ Knowledge Base Test Failed.');
    }
}

async function testSelfCoder() {
    console.log('\n--- Testing Self-Coder ---');

    // Draft a dummy skill
    const skillName = 'test-skill';
    const description = 'A temporary skill for testing self-coding capabilities.';
    const code = `
export async function test_func(args) {
    return { success: true, message: 'Hello from test-skill!' };
}
`;
    const toolSpec = {
        "test_func": {
            "function": "test_func",
            "description": "Returns hello message",
            "parameters": {}
        }
    };

    console.log(`📝 Drafting skill: "${skillName}"`);
    const draftRes = await create_draft_skill({
        name: skillName,
        description,
        code_js: code,
        tool_spec: toolSpec
    });

    if (draftRes.success) {
        console.log('✅ Draft created successfully.');

        // Simulate Install (User approval simulation)
        console.log(`🚀 Installing skill: "${skillName}"`);
        // We catch error mostly because we might not want to permanently pollute skills/ folder in a test unless we clean up.
        // But for verification, let's try it.
        const installRes = await install_skill({ name: skillName });

        if (installRes.success) {
            console.log('✅ Skill installed successfully.');
        } else {
            console.error('❌ Install failed:', installRes.error);
        }
    } else {
        console.error('❌ Draft failed:', draftRes.error);
    }
}

async function runTests() {
    await testKnowledgeBase();
    await testSelfCoder();
}

runTests().catch(console.error);
