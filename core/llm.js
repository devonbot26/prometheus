import 'dotenv/config';
import fetch from 'node-fetch';
/**
 * Prometheus LLM Interface
 * Routes requests to Gemini (cloud) or Qwen (local) based on availability.
 */

const LOCAL_URL = 'http://127.0.0.1:18888';
const GEMINI_MODEL = 'gemini-2.0-flash';

const LOCAL_MODEL_7B = process.env.LLM_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit';
const LOCAL_MODEL_14B = 'mlx-community/Qwen2.5-14B-Instruct-4bit';

/**
 * Check if local LLM server is available
 */
async function isLocalAvailable() {
    try {
        const res = await fetch(`${LOCAL_URL}/v1/models`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Call Local LLM with retry logic
 */
async function callLocal(messages, options = {}) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        console.log(`[DEBUG] Calling ${LOCAL_URL}/v1/chat/completions (Attempt ${attempt + 1}/${maxRetries})`);
        try {
            const startTime = Date.now();
            const res = await fetch(`${LOCAL_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: options.deepThinking ? LOCAL_MODEL_14B : LOCAL_MODEL_7B,
                    messages,
                    temperature: options.temperature ?? 0.0,
                    max_tokens: options.maxTokens ?? 2048,
                    stream: false
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(`Local LLM Error (${res.status}): ${JSON.stringify(errorData)}`);
            }

            console.log(`[DEBUG] Received response status: ${res.status}`);
            const data = await res.json();
            console.log('[DEBUG] Successfully parsed response JSON.');
            const endTime = Date.now();
            const durationS = (endTime - startTime) / 1000;
            const completionTokens = data.usage?.completion_tokens || 0;
            const tps = completionTokens > 0 && durationS > 0 ? (completionTokens / durationS).toFixed(1) : 0;

            const choice = data.choices?.[0]?.message || {};
            let text = choice.content || '';
            const reasoning = choice.reasoning || '';

            // If content is empty but reasoning exists, use reasoning as the main text
            // or provide a fallback to ensure the user knows something happened.
            if (!text && reasoning) {
                text = reasoning;
            }

            return {
                text,
                reasoning,
                usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                tps: parseFloat(tps)
            };
        } catch (e) {
            attempt++;
            console.error(`[DEBUG] callLocal attempt ${attempt} failed: ${e.message}`);

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s...
                console.log(`⏳ Retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw e;
            }
        }
    }
}

/**
 * Call Gemini (Cloud) LLM
 */
async function callGemini(messages, options = {}) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

    console.log(`[DEBUG] Calling Gemini Cloud (${GEMINI_MODEL})`);

    // Gemini 1.5/2.0 Flash expects a specific format for Google AI SDK or standard OpenAI-like REST
    // Since we use node-fetch, we'll hit the Google AI API directly or via an OpenAI-compatible proxy if configured.
    // Given the previous setup, we'll assume a standard OpenAI-compatible REST endpoint for simplicity 
    // or use the specialized Google AI URL.

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Gemini Cloud Error: ${JSON.stringify(err)}`);
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return {
            text,
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            tps: 0 // Cloud speed varies
        };
    } catch (e) {
        console.error(`❌ callGemini failed: ${e.message}`);
        throw e;
    }
}

let modelOverride = null;

export function setModelOverride(model) {
    modelOverride = model;
}

/**
 * Get the currently loaded models from MLX server
 */
async function getLocalModels() {
    try {
        const res = await fetch(`${LOCAL_URL}/v1/models`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return [];
        const data = await res.json();
        // MLX returns an array of models in data.data
        return (data.data || []).map(m => m.id);
    } catch {
        return [];
    }
}

let currentLocalModel = null; // Track what we think is running

/**
 * Main chat function
 */
export async function chat(messages, options = {}) {
    const modelToUse = options.forceModel || modelOverride;

    // Determine target local model
    const targetLocalModel = options.deepThinking ? LOCAL_MODEL_14B : LOCAL_MODEL_7B;

    // 1. Check if we need to switch models
    const availableModels = await getLocalModels();
    const localUp = availableModels.length > 0;
    const isRunningTarget = availableModels.includes(targetLocalModel);

    if (localUp && !isRunningTarget) {
        console.log(`🔄 Model mismatch! Available: ${availableModels.join(', ')}. Target: ${targetLocalModel}. Requesting restart...`);
        if (process.send) {
            process.send({ type: 'RESTART_LLAMA', model: targetLocalModel });

            // Wait for restart (poll health)
            console.log('⏳ 正在等待模型切換... | Waiting for model switch...');
            let attempts = 0;
            while (attempts < 60) { // Up to 60s for 14B
                await new Promise(r => setTimeout(r, 1000));
                const newModels = await getLocalModels();
                if (newModels.includes(targetLocalModel)) {
                    // Small additional wait to ensure the /chat/completions endpoint is ready
                    await new Promise(r => setTimeout(r, 2000));
                    console.log('✅ Model switch complete.');
                    break;
                }
                attempts++;
            }
        }
    } else if (!localUp) {
        // If down, try to start the intended one
        console.log(`⚠️ Local server offline. Starting ${targetLocalModel}...`);
        if (process.send) {
            process.send({ type: 'RESTART_LLAMA', model: targetLocalModel });
            currentLocalModel = targetLocalModel;

            console.log('⏳ Waiting for server startup...');
            let attempts = 0;
            while (attempts < 60) {
                await new Promise(r => setTimeout(r, 1000));
                if (await isLocalAvailable()) {
                    await new Promise(r => setTimeout(r, 2000));
                    console.log('✅ Server online.');
                    break;
                }
                attempts++;
            }
        }
    } else {
        // Already running the correct model
        currentLocalModel = targetLocalModel;
    }

    // 2. Local Usage
    if (options.deepThinking || options.forceLocal) {
        if (!await isLocalAvailable()) throw new Error('Local LLM server is not ready');
        const result = await callLocal(messages, options);
        // Derive basename from LLM_MODEL (e.g., 'Nanbeige4.1-3B-8bit' -> 'nanbeige')
        const modelName = (process.env.LLM_MODEL || 'local').split('/').pop().split('-')[0].toLowerCase();
        const modelId = options.deepThinking ? `${modelName}-7b-local` : `${modelName}-3b-local`;
        return { ...result, model: modelId, tps: result.tps };
    }

    // 3. Cloud Usage (Explicit)
    if (options.forceCloud) {
        const result = await callGemini(messages, options);
        return { ...result, model: GEMINI_MODEL };
    }

    // 4. Fallback logic: Try Local first, then Cloud
    if (await isLocalAvailable()) {
        const result = await callLocal(messages, options);
        const modelName = (process.env.LLM_MODEL || 'local').split('/').pop().split('-')[0].toLowerCase();
        const modelId = options.deepThinking ? `${modelName}-7b-local` : `${modelName}-3b-local`;
        return { ...result, model: modelId, tps: result.tps };
    }

    if (process.env.GEMINI_API_KEY) {
        const result = await callGemini(messages, options);
        return { ...result, model: GEMINI_MODEL };
    }

    throw new Error('No LLM available');
}

/**
 * Simple one-shot prompt (convenience wrapper)
 */
export async function prompt(text, options = {}) {
    const result = await chat([{ role: 'user', content: text }], options);
    return result;
}

export { isLocalAvailable };
