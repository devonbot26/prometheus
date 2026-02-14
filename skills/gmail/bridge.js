/**
 * Gmail Skill Bridge
 * Directly integrates logic from ~/Documents/ai-gmail-agent.
 */

import { authorize as _authorize, processInbox, sendOrDraft } from '/Users/devonwong/Documents/ai-gmail-agent/src/agent.js';

export const authorize = _authorize;

// The ai-gmail-agent expects token.json and credentials.json in its process.cwd()
// We need to ensure we pass the right auth object or wrap the calls.
// Since the agent.js uses process.cwd() for TOKEN_PATH, we might need to 
// either fix agent.js or ensure the environment is right.

export async function gmail_scan() {
    const auth = await _authorize();
    const output = await processInbox(auth);
    return { success: true, output };
}

export async function gmail_compose(args) {
    const { to, subject, body } = args;
    const auth = await _authorize();
    const result = await sendOrDraft(auth, to, subject, body);
    return { success: true, ...result };
}
