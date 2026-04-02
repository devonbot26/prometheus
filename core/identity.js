/**
 * Prometheus Base Identity & Prompt Builder
 */

export const IDENTITY = {
    name: 'Prometheus',
    version: '2.0',
    owner: 'Nelson Wong',

    // Base system template (Context injected by agent.js)
    systemPrompt: `{SKILL_SUMMARIES}`
};

/**
 * Build the system prompt shell
 */
export function buildSystemPrompt(skillSummaries) {
    return IDENTITY.systemPrompt.replace('{SKILL_SUMMARIES}', skillSummaries || 'No skills loaded.');
}
