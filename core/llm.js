import { logDebug, logDebugError } from './logger.js';
import { StreamWatchdog } from './loop-watchdog.js';
import { withLock } from './llm_lock.js';
/**
 * Prometheus LLM Interface
 * Routes requests to Gemini (cloud) or Qwen (local) based on availability.
 */

const PORT_FAST  = parseInt(process.env.LLAMA_PORT || '18888');

function getLocalUrl(port) {
    return `http://127.0.0.1:${PORT_FAST}`;
}

async function isPortAvailable(port) {
    try {
        const res = await fetch(`http://127.0.0.1:${PORT_FAST}/v1/models`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return true;
        const res2 = await fetch(`http://127.0.0.1:${PORT_FAST}/models`, { signal: AbortSignal.timeout(2000) });
        return res2.ok;
    } catch { return false; }
}
const GEMINI_MODEL = 'gemini-2.0-flash';

const LOCAL_MODEL_DEFAULT = process.env.LLM_MODEL || 'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit';
const LOCAL_MODEL_HEAVY  = process.env.LLM_MODEL_HEAVY || 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit';

/**
 * Check if local LLM server is available
 */
async function isLocalAvailable() {
    return await isPortAvailable(PORT_FAST);
}

/**
 * Call Local LLM with retry logic
 */
async function callLocal(messages, options = {}, targetModelOverride = null) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        const targetModel = targetModelOverride || (options.deepThinking ? LOCAL_MODEL_HEAVY : LOCAL_MODEL_DEFAULT);
        const isVL = targetModel.toLowerCase().includes('vlm');
        const urlPrefix = getLocalUrl();
        console.log(`[DEBUG] Calling ${urlPrefix}${isVL ? '/chat/completions' : '/v1/chat/completions'} (Attempt ${attempt + 1}/${maxRetries})`);
        try {
            const startTime = Date.now();

            // VL models launched via start_llama.sh currently use mlx_vlm, which omits the /v1 prefix.
            const modelNameLower = targetModel.toLowerCase();
            // mlx_vlm.server (Vision models) uses /chat/completions
            // mlx_lm.server (Standard LLMs, including Qwen 3.5) uses /v1/chat/completions
            const isVL = modelNameLower.includes('vlm');
            const endpoint = isVL ? '/chat/completions' : '/v1/chat/completions';

            // mlx_vlm.server strict compatibility dictates omit adapters from generation payload
            const reqBody = {
                model: targetModel,
                messages,
                temperature: options.temperature ?? 0.0,
                max_tokens: options.maxTokens ?? 2048,
                repetition_penalty: 1.18,
                stream: false
            };
            if (!isVL) reqBody.adapters = options.adapterPath || null;

            const res = await fetch(`${urlPrefix}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody),
                signal: options.signal
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

            const ttft = (endTime - startTime); // For non-streaming, TTFT is total time unless we use a probe
            
            return {
                text,
                reasoning,
                usage: {
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: totalTokens
                },
                tps: parseFloat(tps),
                ttft
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
 * Call Local Model (Streaming)
 */
async function callLocalStreaming(messages, options = {}, targetModelOverride = null) {
    const targetModel = targetModelOverride || (options.deepThinking ? LOCAL_MODEL_HEAVY : LOCAL_MODEL_DEFAULT);
    const isVL = targetModel.toLowerCase().includes('vlm');
    const endpoint = isVL ? '/chat/completions' : '/v1/chat/completions';
    console.log(`[DEBUG] Selected endpoint: ${endpoint} for model: ${targetModel}`);

    const urlPrefix = getLocalUrl();
    console.log(`[DEBUG] Calling ${urlPrefix}${endpoint} with stream: true`);

    // TTFT Watchdog (Time To First Token) implementation with AbortController integration
    const watchdogController = new AbortController();
    const combinedSignals = options.signal ? 
        AbortSignal.any([options.signal, watchdogController.signal]) : 
        watchdogController.signal;

    let firstTokenTime = 0;
    const reqStart = Date.now();

    const reqBody = {
        model: targetModel,
        messages,
        temperature: options.temperature ?? 0.0,
        max_tokens: options.maxTokens ?? 2048,
        repetition_penalty: 1.18,
        stream: true
    };

    if (options.adapterPath && !isVL) {
        reqBody.adapters = options.adapterPath;
    }

    const isHeavyModel = targetModel === process.env.LLM_MODEL_HEAVY || targetModel.toLowerCase().includes('9b') || targetModel.toLowerCase().includes('14b');
    const ttftSeconds = isHeavyModel ? 120 : 60;
    let ttftTimeout = setTimeout(() => {
        if (!firstTokenTime) {
            console.error(`🚨 [TIMEOUT] TTFT Watchdog triggered! No tokens after ${ttftSeconds}s. Aborting server connection.`);
            watchdogController.abort();
        }
    }, ttftSeconds * 1000);

    const res = await fetch(`${urlPrefix}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: combinedSignals
    });

    if (!res.ok) {
        clearTimeout(ttftTimeout);
        throw new Error(`Local LLM Streaming Error (${res.status}): ${res.statusText}`);
    }

    if (!res.body) {
        clearTimeout(ttftTimeout);
        throw new Error("Local LLM Streaming Error: No response body received.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let textOut = '';
    let reasoningOut = '';
    let streamDone = false;
    let completionTokens = 0;
    const watchdog = options.watchdog || new StreamWatchdog();

    while (!streamDone) {
        // High-level watchdog: if we stick in reader.read() too long, abort
        const readPromise = reader.read();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("STREAM_READ_TIMEOUT")), 120000)
        );

        let value, done;
        try {
            const resRace = await Promise.race([readPromise, timeoutPromise]);
            value = resRace.value;
            done = resRace.done;
        } catch (e) {
            clearTimeout(ttftTimeout);
            throw e;
        }
        
        if (done) {
            clearTimeout(ttftTimeout);
            streamDone = true;
            break;
        }

        if (!firstTokenTime) {
            firstTokenTime = Date.now();
            clearTimeout(ttftTimeout);
            logDebug(`[DEBUG] [TTFT] ${firstTokenTime - reqStart}ms`);
        }

        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            if (trimmedLine.startsWith('data: ')) {
                const dataStr = trimmedLine.substring(6).trim();

                if (dataStr === '[DONE]') {
                    streamDone = true;
                    break;
                }

                try {
                    const json = JSON.parse(dataStr);
                    if (json.choices && json.choices[0] && json.choices[0].delta) {
                        const delta = json.choices[0].delta;
                        const chunkContent = delta.content || delta.text || ''; 
                        const chunkReasoning = delta.reasoning || delta.reasoning_content || '';

                        if (chunkContent || chunkReasoning) {
                            completionTokens++;
                        }

                        if (chunkContent) {
                            textOut += chunkContent;
                            
                            if (watchdog && watchdog.push(chunkContent)) {
                                console.error(`🚨 [WATCHDOG] Loop/Stall detected in content stream! Aborting.`);
                                watchdogController.abort();
                                throw new Error('LOOP_DETECTED');
                            }

                            if (options.onToken) {
                                options.onToken(chunkContent, false);
                            }
                        }

                        if (chunkReasoning) {
                            reasoningOut += chunkReasoning;
                            
                            if (watchdog && watchdog.push(chunkReasoning)) {
                                console.error(`🚨 [WATCHDOG] Loop/Stall detected in reasoning stream! Aborting.`);
                                watchdogController.abort();
                                throw new Error('LOOP_DETECTED');
                            }

                            if (options.onToken) {
                                options.onToken(chunkReasoning, true);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[DEBUG] Stream parse error:', e.message, 'Line:', dataStr);
                }
            }
        }
        if (streamDone) break;
    }

    const endTime = Date.now();
    const genDurationS = firstTokenTime && endTime > firstTokenTime ? (endTime - firstTokenTime) / 1000 : 0.1;
    const tps = completionTokens > 0 && genDurationS > 0 ? (completionTokens / genDurationS).toFixed(1) : 0;

    clearTimeout(ttftTimeout);

    const ttft = firstTokenTime ? (firstTokenTime - reqStart) : (endTime - reqStart);

    return {
        text: textOut,
        reasoning: reasoningOut,
        usage: {
            completion_tokens: completionTokens,
            total_tokens: completionTokens
        },
        tps: parseFloat(tps),
        ttft
    };
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
            body: JSON.stringify(requestBody),
            ...(options.signal && { signal: options.signal })
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
        const url = getLocalUrl();
        let res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2000) });

        // Fallback to mlx_vlm /models endpoint
        if (!res.ok) {
            res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(2000) });
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
    return await withLock('prometheus', async () => {
        const modelToUse = options.forceModel || modelOverride;

        // Determine target local model
        const targetLocalModel = options.modelId || (options.fast ? LOCAL_MODEL_DEFAULT : (options.deepThinking ? LOCAL_MODEL_HEAVY : LOCAL_MODEL_DEFAULT));

    // Determine which port to use

    // 0. Respect explicit overrides
    if (modelToUse === 'gemini') {
        const result = await callGemini(messages, options);
        return { ...result, model: GEMINI_MODEL };
    }

    if (modelToUse === 'local' && await isLocalAvailable()) {
        const result = options.onToken ? 
            await callLocalStreaming(messages, options, targetLocalModel) : 
            await callLocal(messages, options, targetLocalModel);
        return { ...result, model: 'local' };
    }

    // 1. Check if we need to switch models
    const availableModels = await getLocalModels();
    const localUp = availableModels.length > 0;
    const isRunningTarget = availableModels.includes(targetLocalModel);

    if (localUp && !isRunningTarget) {
        console.log(`🔄 Model mismatch! Available: ${availableModels.join(', ')}. Target: ${targetLocalModel}.`);
        if (process.send) {
            process.send({ type: 'RESTART_LLAMA', model: targetLocalModel });

            console.log('⏳ Waiting for model switch...');
            let attempts = 0;
            while (attempts < 300) { // Up to 300s for 9B/14B+ models
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
            if (attempts >= 300) {
                console.warn(`⚠️ Timeout waiting for model switch: ${targetLocalModel}. Proceeding anyway (may fail).`);
            }
        }
    } else if (!localUp) {
        // If down, try to start the intended one
        console.log(`⚠️ Local server offline. Starting ${targetLocalModel}...`);
        if (process.send) {
            process.send({ type: 'RESTART_LLAMA', model: targetLocalModel });
            currentLocalModel = targetLocalModel;
        }

        console.log('⏳ Waiting for server startup...');
        let attempts = 0;
        while (attempts < 300) { // Increased to 5 minutes for slow model loads
            await new Promise(r => setTimeout(r, 1000));
            if (await isLocalAvailable()) {
                await new Promise(r => setTimeout(r, 2000)); // Additional buffer for memory mapping
                console.log('✅ Server online with new model.');
                break;
            }
            attempts++;
        }
        if (attempts >= 300) {
            throw new Error(`Timeout waiting for Llama Server to load model: ${targetLocalModel}`);
        }
    } else {
        // Already running the correct model
        currentLocalModel = targetLocalModel;
    }

    // 2. Local Usage
    if (options.deepThinking || options.forceLocal) {
        const result = options.onToken ? await callLocalStreaming(messages, options, targetLocalModel) : await callLocal(messages, options, targetLocalModel);
        // Derive a readable model identifier from LLM_MODEL
        const modelStr = process.env.LLM_MODEL || 'local';
        const modelBase = modelStr.split('/').pop();
        const sizeMatch = modelBase.match(/(\d+[Bb])/);
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
        const result = options.onToken ? await callLocalStreaming(messages, options, targetLocalModel) : await callLocal(messages, options, targetLocalModel);
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
    });
}

/**
 * Simple one-shot prompt (convenience wrapper)
 */
export async function prompt(text, options = {}) {
    const result = await chat([{ role: 'user', content: text }], options);
    return result;
}

export { isLocalAvailable };
