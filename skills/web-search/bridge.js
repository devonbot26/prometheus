/**
 * Web Search Skill Bridge
 * Directly integrates logic from ~/Documents/ai-web-agent.
 */

import Agent from '/Users/devonwong/Documents/Projects/ai-web-agent/src/agent.js';

let agentInstance = null;

async function getAgent() {
    if (!agentInstance) {
        agentInstance = new Agent();
    }
    return agentInstance;
}

export async function web_search(args) {
    const { query } = args;
    const agent = await getAgent();

    // The web agent's run method returns { answer, sources, steps }
    const result = await agent.run(query);

    return {
        success: true,
        output: result.answer,
        sources: result.sources
    };
}
