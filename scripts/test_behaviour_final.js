import { Agent } from '../core/agent.js';

async function performBehaviourTest() {
    console.log("🚀 Starting Final Behaviour Test...");
    const agent = new Agent();
    
    const testCases = [
        {
            name: "Lottery Numbers Prompt",
            prompt: "generate 6 random numbers to 1 - 49"
        }
    ];

    for (const test of testCases) {
        console.log(`\n\n--- TEST CASE: ${test.name} ---`);
        let msgEmitted = false;
        let lastMsg = null;
        let logEmitted = false;

        agent.on('message', (msg) => {
            msgEmitted = true;
            lastMsg = msg;
        });

        agent.on('log', (log) => {
            if (log.includes('🧠 Thinking...')) logEmitted = true;
        });

        const result = await agent.process(test.prompt);

        console.log("✅ Turn Finished.");
        console.log("Message Event Emitted:", msgEmitted);
        console.log("Thinking Log Emitted:", logEmitted);
        console.log("Assistant Text Length:", lastMsg?.content?.length || 0);
        console.log("Reasoning Captured:", (lastMsg?.reasoning?.length || 0) > 0);
        console.log("Performance Metrics:", JSON.stringify(lastMsg?.performance || {}));

        if (!msgEmitted) {
            console.error("❌ FAILURE: Message event was not emitted!");
            process.exit(1);
        }

        if ((lastMsg?.content?.length || 0) === 0) {
           console.error("❌ FAILURE: Assistant content is empty!");
           process.exit(1);
        }

        const hasLeakedTags = /<(?:think|thinking|thought)>/.test(lastMsg.content);
        console.log("Tags Successfully Stripped:", !hasLeakedTags);
        if (hasLeakedTags) {
            console.error("❌ FAILURE: Tags leaked into final content!");
            process.exit(1);
        }
    }

    console.log("\n\n✨ ALL BEHAVIOUR TESTS PASSED! System is stable.");
    process.exit(0);
}

performBehaviourTest().catch(err => {
    console.error("💥 TEST CRASHED:", err);
    process.exit(1);
});
