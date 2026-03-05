import 'dotenv/config';
import fetch from 'node-fetch';
import { logDebug, logDebugError } from './logger.js';
/**
 * Prometheus LLM Interface
 * Routes requests to Gemini (cloud) or Qwen (local) based on availability.
 */

function getLocalUrl() {
    const port = process.env.LLM_PORT || 18888;
    return `http://127.0.0.1:${port}`;
}
const GEMINI_MODEL = 'gemini-2.0-flash';

const LOCAL_MODEL_4B = process.env.LLM_MODEL || 'mlx-community/Qwen3.5-4B-4bit';
const LOCAL_MODEL_9B = 'mlx-community/Qwen3.5-9B-4bit';

/**
 * Check if local LLM server is available
 */
async function isLocalAvailable() {
    try {
        // Try the standard /v1/models first
        let res = await fetch(`${getLocalUrl()}/v1/models`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return true;

        // Try the mlx_vlm fallback endpoint
        res = await fetch(`${getLocalUrl()}/models`, { signal: AbortSignal.timeout(2000) });
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
        const targetModel = options.deepThinking ? LOCAL_MODEL_9B : LOCAL_MODEL_4B;
        console.log(`[DEBUG] Calling ${getLocalUrl()}${targetModel.toLowerCase().includes('vl') || targetModel.toLowerCase().includes('qwen3.5') ? '/chat/completions' : '/v1/chat/completions'} (Attempt ${attempt + 1}/${maxRetries})`);
        try {
            const startTime = Date.now();

            // VL models launched via start_llama.sh currently use mlx_vlm, which omits the /v1 prefix.
            const modelNameLower = targetModel.toLowerCase();
            const isVL = modelNameLower.includes('vl') || modelNameLower.includes('qwen3.5');
            const endpoint = isVL ? '/chat/completions' : '/v1/chat/completions';

            // mlx_vlm.server strict compatibility dictates omit adapters from generation payload
            const reqBody = {
                model: targetModel,
                messages,
                temperature: options.temperature ?? 0.0,
                max_tokens: options.maxTokens ?? 2048,
                stream: false
            };
            if (!isVL) reqBody.adapters = options.adapterPath || null;

            const res = await fetch(`${getLocalUrl()}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(`Local LLM Error (${res.status}): ${JSON.stringify(errorData)}`);
            }

            console.log(`[DEBUG] Received response status: ${res.status}`);
            const data = await res.json();
            logDebug('[DEBUG] Successfully parsed response JSON.');
            const endTime = Date.now();
            const durationS = (endTime - startTime) / 1000;
            const usage = data.usage || {};
            const completionTokens = usage.completion_tokens || usage.output_tokens || 0;
            const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
            const totalTokens = usage.total_tokens || (completionTokens + promptTokens);

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
                usage: {
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: totalTokens
                },
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

    const modelToUse = options.cloudModel || GEMINI_MODEL;
    console.log(`[DEBUG] Calling Gemini Cloud (${modelToUse})`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    // Extract system message for Gemini's systemInstruction field
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const contents = chatMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const requestBody = { contents };
    if (systemMsg) {
        requestBody.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
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
        let res = await fetch(`${getLocalUrl()}/v1/models`, { signal: AbortSignal.timeout(2000) });

        // Fallback to mlx_vlm /models endpoint
        if (!res.ok) {
            res = await fetch(`${getLocalUrl()}/models`, { signal: AbortSignal.timeout(2000) });
        }

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

    // 0. Respect explicit overrides
    if (modelToUse === 'gemini') {
        const result = await callGemini(messages, options);
        return { ...result, model: GEMINI_MODEL };
    }

    if (modelToUse === 'local' && await isLocalAvailable()) {
        const result = await callLocal(messages, options);
        return { ...result, model: 'local' };
    }

    // Determine target local model
    const targetLocalModel = options.deepThinking ? LOCAL_MODEL_9B : LOCAL_MODEL_4B;

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
            while (attempts < 120) { // Increased to 2 minutes for 9B model
                await new Promise(r => setTimeout(r, 1000));
                if (await isLocalAvailable()) {
                    await new Promise(r => setTimeout(r, 2000)); // Additional buffer for memory mapping
                    console.log('✅ Server online with new model.');
                    break;
                }
                attempts++;
            }
            if (attempts >= 120) {
                throw new Error(`Timeout waiting for Llama Server to load model: ${targetLocalModel}`);
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
        // Derive a readable model identifier from LLM_MODEL
        const modelStr = process.env.LLM_MODEL || 'local';
        const modelBase = modelStr.split('/').pop();
        const sizeMatch = modelBase.match(/(\\d+[Bb])/);
        const modelName = modelBase.split('-')[0].toLowerCase();
        const modelSize = sizeMatch ? sizeMatch[1].toLowerCase() : 'local';
        const modelId = `${modelName}-${modelSize}-local`;
        return { ...result, model: modelId, tps: result.tps };
    }

    // 3. Cloud Usage (Explicit)
    if (options.forceCloud) {
        const result = await callGemini(messages, options);
        return { ...result, model: options.cloudModel || GEMINI_MODEL };
    }

    // 4. Fallback logic: Try Local first, then Cloud
    if (await isLocalAvailable()) {
        const result = await callLocal(messages, options);
        const modelStr2 = process.env.LLM_MODEL || 'local';
        const modelBase2 = modelStr2.split('/').pop();
        const sizeMatch2 = modelBase2.match(/(\d+[Bb])/);
        const modelName2 = modelBase2.split('-')[0].toLowerCase();
        const modelSize2 = sizeMatch2 ? sizeMatch2[1].toLowerCase() : 'local';
        const modelId = `${modelName2}-${modelSize2}-local`;
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
