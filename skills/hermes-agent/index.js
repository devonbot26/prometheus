import { HermesAdapter } from '../../core/hermes_adapter.js';

const hermes = new HermesAdapter();

/**
 * Delegate a task to the Hermes Agent for deep reasoning or evolution
 */
export async function delegate_to_hermes(args) {
    console.log(`📡 [HERMES_SKILL] Delegating task: "${args.task.substring(0, 50)}..."`);
    
    let context = {};
    if (args.context) {
        try {
            context = JSON.parse(args.context);
        } catch (e) {
            context = { raw: args.context };
        }
    }

    const result = await hermes.delegate(args.task, context);

    if (result.error) {
        return `❌ Hermes Error: ${result.error}`;
    }

    return `## 🔮 Hermes Agent Perspective\n\n${result.text}`;
}
