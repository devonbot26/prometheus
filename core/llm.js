/**
 * Prometheus LLM Interface
 * Routes requests to Gemini (cloud) or Qwen (local) based on availability.
 */

const LOCAL_URL = 'http://127.0.0.1:18888';
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Check if local LLM server is available
 */
async function isLocalAvailable() {
    try {
        const res = await fetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        return data.status === 'ok';
    } catch {
        return false;
    }
}

/**
 * Call Local LLM (Qwen 2.5 3B via llama-server)
 */
async function callLocal(messages, options = {}) {
    console.log(`[DEBUG] Calling ${LOCAL_URL}/v1/chat/completions`);
    try {
        const res = await fetch(`${LOCAL_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen2.5-3b',
                messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? 1024,
                stream: false
            })
        });
        const data = await res.json();
        console.log(`[DEBUG] Response received: ${JSON.stringify(data).substring(0, 100)}...`);
        return data.choices?.[0]?.message?.content || '';
    } catch (e) {
        console.error(`[DEBUG] callLocal error: ${e.message}`);
        throw e;
    }
}

/**
 * Call Gemini via Google AI SDK (using API key from env)
 */
async function callGemini(messages, options = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    // Convert chat messages to Gemini format
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens ?? 2048
            }
        })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Main chat function — tries Gemini first, falls back to local
 * @param {Array} messages - [{role: 'user'|'assistant'|'system', content: string}]
 * @param {Object} options - {temperature, maxTokens, forceLocal}
 * @returns {Promise<{text: string, model: string}>}
 */
export async function chat(messages, options = {}) {
    // Force local mode (for private data like emails)
    if (options.forceLocal) {
        const localUp = await isLocalAvailable();
        if (!localUp) throw new Error('Local LLM required but not available');
        const text = await callLocal(messages, options);
        return { text, model: 'qwen-2.5-3b-local' };
    }

    // Try Gemini first, fall back to local
    try {
        if (process.env.GEMINI_API_KEY) {
            const text = await callGemini(messages, options);
            return { text, model: GEMINI_MODEL };
        }
    } catch (e) {
        console.log(`⚠️ Gemini failed (${e.message}), falling back to local...`);
    }

    // Fallback: local LLM
    const localUp = await isLocalAvailable();
    if (localUp) {
        const text = await callLocal(messages, options);
        return { text, model: 'qwen-2.5-3b-local' };
    }

    throw new Error('No LLM available (Gemini failed, local server down)');
}

/**
 * Simple one-shot prompt (convenience wrapper)
 */
export async function prompt(text, options = {}) {
    const result = await chat([{ role: 'user', content: text }], options);
    return result;
}

export { isLocalAvailable };
