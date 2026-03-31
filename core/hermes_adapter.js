import fetch from 'node-fetch';

const HERMES_API = process.env.HERMES_API || 'http://localhost:8642';
const HERMES_TIMEOUT = 120000;

/**
 * Adapter to communicate with the Hermes Agent sidecar API.
 * Handles context translation, error isolation, and supervisor heartbeats.
 */
export class HermesAdapter {
    constructor() {
        this.available = false;
    }

    /**
     * Check if the Hermes sidecar is reachable
     */
    async ping() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${HERMES_API}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);
            this.available = res.ok;
        } catch (e) {
            this.available = false;
        }
        return this.available;
    }

    /**
     * Delegate a task to Hermes Agent
     * @param {string} prompt - The task description
     * @param {object} context - Project context/state
     */
    async delegate(prompt, context = {}) {
        const alive = await this.ping();
        if (!alive) {
            return { 
                error: 'Hermes Agent is not reachable at ' + HERMES_API + '. Ensure the sidecar is running.' 
            };
        }

        // Send IPC heartbeat to prom.js to prevent idle-unload of the MLX server
        if (process.send) {
            process.send({ type: 'HERMES_ACTIVITY' });
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), HERMES_TIMEOUT);

            const res = await fetch(`${HERMES_API}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { 
                            role: 'system', 
                            content: `You are a high-level reasoning and evolutionary module for the Prometheus agent system. 
                            You have access to the same local MLX server. 
                            Current Project Context:\n${JSON.stringify(context, null, 2)}
                            
                            Instructions:
                            1. If creating skills, use Prometheus JavaScript format.
                            2. Be concise but deep in reasoning.
                            3. Strictly avoid conflicting with existing prom.js supervisor logic.`
                        },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 2048,
                    temperature: 0.7
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            if (!res.ok) {
                return { error: `Hermes API returned status: ${res.status}` };
            }

            const data = await res.json();
            return { 
                text: data.choices?.[0]?.message?.content || 'No completion returned.', 
                model: 'hermes-agent' 
            };

        } catch (e) {
            // ERROR ISOLATION: Catch and return formatted error to prevent crashing main loop
            const message = e.name === 'AbortError' ? 'Request timed out after 120s' : e.message;
            console.error(`⚠️ [HERMES_ADAPTER] Failure: ${message}`);
            return { error: `Hermes bridge failure: ${message}` };
        }
    }
}
