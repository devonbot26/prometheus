
import { resolveIntent } from './core/decision-tree.js';
import { projectIndexer } from './services/project-indexer.js';
import fs from 'fs';

async function diagnose() {
    console.log("--- Intent Resolution Diagnosis ---");

    // 1. Initialize to get project triggers
    await projectIndexer.initialize();

    const prompt = "Tell me about iso-clone";
    const history = "";
    const availableSkills = new Set(['knowledge-base', 'web-search', 'terminal', 'gmail', 'mcp-mock']);

    console.log(`Prompt: "${prompt}"`);

    // We'll manually run the resolveIntent logic here to see scores
    const fullContext = (prompt + ' ' + history).toLowerCase();
    const scores = {};

    // Import schema directly to inspect
    const dt = await import('./core/decision-tree.js');
    // Note: Since INTENT_SCHEMA isn't exported, we have to rely on resolveIntent's internal behavior
    // and what we know about the triggers.

    const result = resolveIntent(prompt, history, availableSkills);
    console.log("\nTop Skills Injected:", JSON.stringify(result));

    // Check specific triggers for knowledge-base
    console.log("\nKnowledge-Base Triggers include 'iso-clone'?");
    // We can't easily check secret variable, but we'll infer from score if we could.
}

diagnose().catch(console.error);
