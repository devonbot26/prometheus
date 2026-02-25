/**
 * Prometheus Agent — Core Orchestrator
 * 
 * Flow:
 * 1. User sends message
 * 2. Agent builds context (system prompt + history + tools)
 * 3. LLM decides: respond naturally OR call a tool
 * 4. If tool call → execute tool → feed result back to LLM
 * 5. Return final response to user
 */

console.log('[DEBUG] Loading core/agent.js...');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execSync } from 'child_process';
import { chat } from './llm.js';
import { loadSkills, executeTool, getToolDescriptions, getSkillSummaries, getToolDescriptionsForSkills } from './skill-loader.js';
import { buildSystemPrompt } from './identity.js';
import { quotaTracker } from './quota-tracker.js';
import { errorManager } from './error-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getFreeMemMB() {
    try {
        if (os.platform() === 'darwin') {
            const output = execSync('vm_stat').toString();
            // Match digits at start of line for specific keys
            const freeMatch = output.match(/Pages free:\s+(\d+)/);
            const inactiveMatch = output.match(/Pages inactive:\s+(\d+)/);
            const speculativeMatch = output.match(/Pages speculative:\s+(\d+)/);

            if (freeMatch && inactiveMatch) {
                const free = parseInt(freeMatch[1]);
                const inactive = parseInt(inactiveMatch[1]);
                const speculative = speculativeMatch ? parseInt(speculativeMatch[1]) : 0;
                // VM pages on Apple Silicon are 16KB
                const totalBytes = (free + inactive + speculative) * 16384;
                return Math.floor(totalBytes / (1024 * 1024));
            }
        }
    } catch (e) {
        // Log error to console hidden unless debug is on? For now just silent fallback.
    }
    return Math.floor(os.freemem() / (1024 * 1024));
}
const HISTORY_PATH = path.join(__dirname, 'history.json');

import { EventEmitter } from 'events';

export class Agent extends EventEmitter {
    constructor() {
        super();
        this.skills = loadSkills();
        this.skillSummaries = getSkillSummaries(this.skills);
        this.toolDescriptions = ""; // Start empty, will be filled dynamically
        this.systemPrompt = buildSystemPrompt(this.skillSummaries);
        this.history = this.loadHistory();
        this.quotaTracker = quotaTracker;
    }

    loadHistory() {
        try {
            if (fs.existsSync(HISTORY_PATH)) {
                return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
            }
        } catch (e) {
            console.error('⚠️ Failed to load history:', e.message);
        }
        return [];
    }

    saveHistory() {
        try {
            fs.writeFileSync(HISTORY_PATH, JSON.stringify(this.history, null, 2));
        } catch (e) {
            console.error('⚠️ Failed to save history:', e.message);
        }
    }

    /**
     * Set the active notebook (folder context)
     */
    setNotebook(folderPath) {
        if (!folderPath) {
            this.activeNotebook = null;
            console.log('📖 Notebook closed.');
            return;
        }
        if (fs.existsSync(folderPath)) {
            this.activeNotebook = folderPath;
            console.log(`📖 Notebook opened: ${folderPath}`);
        } else {
            console.error(`❌ Path not found: ${folderPath}`);
        }
    }

    /**
     * Speak text using Mac's 'say' command
     */
    async speak(text) {
        if (!text) return;

        // Clean up text for CLI (remove markdown, speaker labels if needed)
        // For the podcast, we might want to split by speaker to use different voices!
        // Simple MVP: Just speak the whole thing.

        const cleanText = text.replace(/"/g, '\\"'); // Escape quotes
        const cmd = `say -v "Daniel" "${cleanText}"`; // Daniel is a good British voice, or use system default

        try {
            // We want this to run in background or blocking? Blocking for now so we don't overlap.
            // Actually, for a podcast, we want to stream it. 
            // Let's write to a temporary file and speak that file.
            const tmpFile = path.join(__dirname, 'podcast_temp.txt');
            fs.writeFileSync(tmpFile, text);

            console.log('🔊 Speaking...');
            // Using spawn to not unnecessary block Node event loop too hard, but 'say' is blocking by default
            const { exec } = await import('child_process');
            exec(`say -f "${tmpFile}"`); // -f reads from file

        } catch (e) {
            console.error('⚠️ TTS Error:', e.message);
        }
    }

    /**
     * Generate a podcast script from the active notebook
     */
    async generatePodcast() {
        if (!this.activeNotebook) {
            throw new Error('No notebook open. Use /notebook <path> first.');
        }

        console.log('🎙️ Generatng podcast script from notebook...');

        // 1. Read files in notebook
        const files = fs.readdirSync(this.activeNotebook).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
        let context = '';
        for (const file of files) {
            const content = fs.readFileSync(path.join(this.activeNotebook, file), 'utf-8');
            context += `\n--- FILE: ${file} ---\n${content}\n`;
            if (context.length > 20000) break; // Hard limit for now
        }

        // 2. Read prompt template
        const promptPath = path.join(__dirname, '../prompts/notebook/podcast_script.md');
        const promptTemplate = fs.readFileSync(promptPath, 'utf-8');

        // 3. Construct prompt
        const fullPrompt = promptTemplate.replace('[SOURCE_TEXT_GOES_HERE]', context);

        // 4. Call LLM
        const response = await chat([
            { role: 'user', content: fullPrompt }
        ], { forceLocal: true, maxTokens: 4096 });

        const script = response.text;

        // 5. Speak it!
        this.speak(script);

        return script;
    }

    /**
     * Run a specific notebook prompt template
     */
    async runNotebookPrompt(templateName) {
        if (!this.activeNotebook) {
            throw new Error('No notebook open. Use /notebook <path> first.');
        }

        console.log(`🤔 Running ${templateName} analysis...`);

        // 1. Read files in notebook
        const files = fs.readdirSync(this.activeNotebook).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
        let context = '';
        for (const file of files) {
            const content = fs.readFileSync(path.join(this.activeNotebook, file), 'utf-8');
            context += `\n--- FILE: ${file} ---\n${content}\n`;
            if (context.length > 20000) break; // Hard limit for now
        }

        // 2. Read prompt template
        const promptPath = path.join(__dirname, `../prompts/notebook/${templateName}`);
        if (!fs.existsSync(promptPath)) {
            throw new Error(`Prompt template not found: ${templateName}`);
        }
        const promptTemplate = fs.readFileSync(promptPath, 'utf-8');

        // 3. Construct prompt
        const fullPrompt = promptTemplate.replace('[SOURCE_TEXT_GOES_HERE]', context);

        // 4. Call LLM
        const response = await chat([
            { role: 'user', content: fullPrompt }
        ], { forceLocal: true, maxTokens: 4096 });

        return response.text;
    }

    /**
     * Dynamically inject full tool descriptions based on message content
     * @param {string} userMessage 
     */
    dynamicSkillInjection(userMessage) {
        const lowerMatch = userMessage.toLowerCase();
        const detectedSkills = [];

        // Simple keyword mapping for auto-injection
        const keywordMap = {
            'gmail': ['gmail'],
            'email': ['gmail'],
            'mail': ['gmail'],
            'drive': ['google-drive'],
            'google drive': ['google-drive'],
            'search': ['web-search'],
            'browse': ['web-search'],
            'google': ['web-search'],
            'terminal': ['terminal', 'sys-admin'],
            'shell': ['terminal'],
            'git': ['sys-admin'],
            'weather': ['weather'],
            'knowledge': ['knowledge-base'],
            'save': ['knowledge-base'],
            'learn': ['knowledge-base'],
            'skill': ['self-coder'],
            'coding': ['self-coder'],
            'script': ['self-coder', 'terminal'],
            'exam': ['self-coder'],
            'collab': ['collab-board'],
            'message': ['collab-board']
        };

        for (const [kw, skills] of Object.entries(keywordMap)) {
            if (lowerMatch.includes(kw)) {
                skills.forEach(s => {
                    if (!detectedSkills.includes(s)) detectedSkills.push(s);
                });
            }
        }

        if (detectedSkills.length > 0) {
            console.log(`\x1b[32m✅ Loading full schema on-demand: ${detectedSkills.join(', ')}\x1b[0m`);
            return getToolDescriptionsForSkills(this.skills, detectedSkills);
        }

        return "";
    }

    /**
     * Process a user message and return the assistant's response
     * @param {string} userMessage
     */
    async process(userMessage) {
        // Detect Deep Thinking Command
        let deepThinking = false;
        let cleanMessage = userMessage;

        if (userMessage.startsWith('/think ')) {
            deepThinking = true;
            cleanMessage = userMessage.replace('/think ', '');
            console.log('🧠 Deep Thinking mode activated for this request.');
        }

        // Add user message to history
        this.history.push({ role: 'user', content: cleanMessage });

        // Detect Low Memory State
        const freeMB = getFreeMemMB();
        const disableCompressed = process.env.DISABLE_COMPRESSED_PROMPT === 'true';
        const lowMem = freeMB < 500 && !disableCompressed;

        const is3B = (process.env.LLM_MODEL || '').includes('3B') || (process.env.LLM_MODEL || '').toLowerCase().includes('nanbeige');
        console.log(`[DEBUG] Memory: ${freeMB}MB, LowMem: ${lowMem}, is3B: ${is3B}`);

        // GREETING INTERCEPTOR (Stop 3B models from hallucinating tools for simple 'hi')
        const greetings = ['hi', 'hello', 'hey', 'greetings', 'reset'];
        const isSimpleGreeting = greetings.includes(cleanMessage.toLowerCase());

        const dynamicTools = this.dynamicSkillInjection(cleanMessage);

        let finalPrompt = this.systemPrompt;

        if (lowMem || is3B) {
            console.log('[DEBUG] Using optimized prompt for 3B/LowMem');
            finalPrompt = `You are Devon, a conversational AI assistant.
 1. Always respond with text for simple talk (hi, hello, etc.).
 2. ONLY use tools if you see them listed below under "AVAILABLE TOOLS".
 3. If no tools are listed, you cannot perform actions. Ask the user for details.
 4. Keep thinking <think> blocks under 10 words.

${dynamicTools ? 'AVAILABLE TOOLS:\n' + dynamicTools : 'NO TOOLS LOADED.'}`;
        }
        else if (dynamicTools) {
            finalPrompt += `\n\n## Dynamically Loaded Tools\nYou currently have FULL ACCESS to these specific tools because they seem relevant to the request:\n${dynamicTools}`;
        } else {
            finalPrompt += `\n\n## Tool Note\nYou only see skill SUMMARIES above to save memory. 
If you need to use a skill but don't see its parameters, use the following special tool to see its full schema:
\`\`\`json
{"tool": "get_skill_details", "args": {"skill_name": "NAME"}}
\`\`\``;
        }

        // INJECT NOTEBOOK CONTEXT (only if not low memory)
        if (!lowMem && this.activeNotebook) {
            finalPrompt += `\n\n=== ACTIVE NOTEBOOK: ${this.activeNotebook} ===\nAnswer based ONLY on the following context if possible:\n`;
            const files = fs.readdirSync(this.activeNotebook).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
            for (const file of files.slice(0, 5)) { // Limit to 5 files
                const content = fs.readFileSync(path.join(this.activeNotebook, file), 'utf-8');
                finalPrompt += `\n--- ${file} ---\n${content.substring(0, 3000)}\n`; // Truncate per file
            }
        }
        console.log('[DEBUG] Notebook context injection complete.');

        const messages = [];
        if (lowMem || is3B) {
            messages.push({ role: 'system', content: finalPrompt });
            messages.push(...this.history.slice(-10)); // Moderate context
        } else {
            messages.push({ role: 'system', content: finalPrompt });
            messages.push(...this.history);
        }
        console.log('[DEBUG] Messages array prepared for LLM call.');

        // Determine if this should use local model (privacy check)
        const isPrivate = this.isPrivateRequest(cleanMessage) || !!this.activeNotebook; // Force local for notebooks

        // Get LLM response
        console.log(`[DEBUG] Calling chat with ${messages.length} messages...`);
        console.log(`[DEBUG] Full Messages: ${JSON.stringify(messages, null, 2)}`);
        console.log(`🔍 Context: ${finalPrompt.length} chars. Dynamic Tools: ${dynamicTools?.length || 0} chars.`);

        const response = await chat(messages, {
            forceLocal: isPrivate,
            deepThinking,
            maxTokens: 2048
        });
        console.log('[DEBUG] Chat response received.');

        // Track quota
        if (response.usage) {
            quotaTracker.deduct(response.usage.total_tokens);
            this.emit('usage', quotaTracker.getStats());
        }

        let assistantText = response.text;
        const modelUsed = response.model;
        let finalTps = response.tps;

        // Clean up chat template artifacts
        assistantText = assistantText
            .replace(/<\|im_start\|>/g, '')
            .replace(/<\|im_end\|>/g, '')
            .replace(/<\|endoftext\|>/g, '')
            .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove internal thinking tags if they leaked
            .trim();

        // Loop Detector: If response is mostly junk tokens, it's a hallucination loop
        const junkTokens = ['<unk>', '<s>', '</s>', '<|im_start|>', '<|im_end|>'];
        const junkCount = junkTokens.reduce((count, token) => {
            const matches = assistantText.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
            return count + (matches ? matches.length : 0);
        }, 0);

        if (junkCount > 5 || assistantText.length > 5000) {
            console.error('⚠️ [DEBUG] Gibberish loop detected! Blocking response.');
            assistantText = "I encountered a processing error (loop detected). How can I help you today?";
            isSimpleGreeting = true; // Treat as greeting to reset flow
        }

        // If it's a greeting and the model tried to call a tool, strip the JSON to avoid showing it to user
        if (isSimpleGreeting) {
            assistantText = assistantText.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/ig, '').trim();
            assistantText = assistantText.replace(/\{[\s\n]*"tool"[\s\n]*:[\s\n]*"[^"]+"[\s\S]*?\}/g, '').trim();

            if (!assistantText) {
                assistantText = "Hello! I'm Devon. How can I help you today?";
            }
        }

        // Check if LLM wants to call a tool (Bypass if it's a simple greeting to prevent hallucination)
        const toolCall = isSimpleGreeting ? null : this.extractToolCall(assistantText);

        if (toolCall) {
            try {
                console.log(`🔧 Tool call detected: ${toolCall.tool}`);

                // Handle CORE "get_skill_details" tool
                if (toolCall.tool === 'get_skill_details') {
                    const skillName = toolCall.args.skill_name;
                    console.log(`📖 Detailed schema requested for: ${skillName}`);
                    const details = getToolDescriptionsForSkills(this.skills, [skillName]);

                    const toolResultMsg = details
                        ? `Full schema for ${skillName}:\n${details}`
                        : `Skill "${skillName}" not found. Available skills:\n${this.skillSummaries}`;

                    this.history.push({ role: 'assistant', content: assistantText });
                    this.history.push({ role: 'user', content: toolResultMsg });

                    const followUp = await chat([
                        { role: 'system', content: finalPrompt },
                        ...this.history
                    ], { forceLocal: isPrivate, maxTokens: 2048 });

                    assistantText = followUp.text;
                    finalTps = followUp.tps;
                } else {
                    this.emit('tool_start', { tool: toolCall.tool, args: toolCall.args });
                    const result = await executeTool(this.skills, toolCall.tool, toolCall.args);
                    this.emit('tool_end', { tool: toolCall.tool, result });

                    // Check for explicit error return from tool
                    if (result && result.error) {
                        const errorId = errorManager.logError(result.error, `Tool call: ${toolCall.tool}`);
                        // Append Error ID to the result so the agent knows about it
                        result.error_id = errorId;
                        result.system_note = `System logged error as ${errorId}. You should verify this error using read_file then fix it.`;
                    }

                    // Feed tool result back to LLM for natural response
                    const toolResultMsg = `Tool "${toolCall.tool}" returned:\n${JSON.stringify(result, null, 2)}`;
                    this.history.push({ role: 'assistant', content: assistantText });
                    this.history.push({ role: 'user', content: toolResultMsg });

                    const followUp = await chat([
                        { role: 'system', content: finalPrompt },
                        ...this.history
                    ], { forceLocal: isPrivate, maxTokens: 2048 });

                    // Track follow-up quota
                    if (followUp.usage) {
                        quotaTracker.deduct(followUp.usage.total_tokens);
                        this.emit('usage', quotaTracker.getStats());
                    }

                    assistantText = followUp.text;
                    finalTps = followUp.tps;
                }
            } catch (e) {
                // Error Logging Integration
                const errorId = errorManager.logError(e, `Tool call: ${toolCall.tool}`);
                assistantText = `⚠️ Tool error (ID: ${errorId}): ${e.message}. I have logged this error.`;

                // Attempt to auto-fix if it's a code execution error (future: invoke self-coder)
                // For now, we just inform the loop.
            }
        }

        // Add response to history
        this.history.push({ role: 'assistant', content: assistantText });

        // Memory Optimization: Truncate very large tool results in history
        this.history = this.history.map(item => {
            if (item.content.length > 2000) {
                return { ...item, content: item.content.slice(0, 2000) + '... [Content truncated for memory]' };
            }
            return item;
        });

        // Limit history to stay within context and memory limits
        // Filter out empty assistant content which can confuse the model
        this.history = this.history.filter(item => {
            if (item.role === 'assistant' && !item.content && !item.tool_calls) return false;
            return true;
        });

        if (this.history.length > 10) {
            this.history = this.history.slice(-10);
        }

        this.saveHistory();
        this.saveHistory();
        this.emit('message', { role: 'assistant', content: assistantText, model: modelUsed });

        // Check if we resolved an error (simple heuristic or explicit tool call in future)
        // If the assistant says "I have fixed...", we could try to resolve? 
        // For now, rely on manual "resolve_error" tool if we had one, or let user confirm.

        return { text: assistantText, model: modelUsed, tps: finalTps };
    }

    /**
     * Check if a request involves private data (emails, contacts, etc.)
     */
    isPrivateRequest(msg) {
        const privateKeywords = ['email', 'gmail', 'inbox', 'draft', 'compose', 'send email', 'mail', 'contact'];
        const lower = msg.toLowerCase();
        return privateKeywords.some(kw => lower.includes(kw));
    }

    /**
     * Tries to repair common LLM JSON errors
     */
    repairJSON(jsonStr) {
        let repaired = jsonStr;

        // 1. Strip trailing commas from objects or arrays
        repaired = repaired.replace(/,(\s*[\}\]])/g, '$1');

        // 2. Safely escape unescaped newlines ONLY inside JSON strings
        let inString = false;
        let isEscaped = false;
        let finalStr = "";

        for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];

            if (char === '\\') {
                isEscaped = !isEscaped;
                finalStr += char;
            } else {
                if (char === '"' && !isEscaped) {
                    inString = !inString;
                    finalStr += char;
                } else if (inString && (char === '\n' || char === '\r')) {
                    // We found a literal newline inside a string! Escape it properly for JSON.parse
                    finalStr += (char === '\n') ? '\\n' : '\\r';
                } else {
                    // Not in a string, or just a normal character. Keep exactly as-is.
                    finalStr += char;
                }
                isEscaped = false;
            }
        }

        return finalStr;
    }

    /**
     * Extract a tool call JSON from LLM response intelligently
     */
    extractToolCall(text) {
        try {
            // Normalize: handle <tool_call> tags and remove <think> blocks
            let cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            cleanText = cleanText.replace(/<tool_call>/gi, '').replace(/<\/tool_call>/gi, '');

            // Try markdown blocks first
            const blockMatch = cleanText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
            if (blockMatch) {
                try {
                    const parsed = JSON.parse(blockMatch[1]);
                    if (parsed.tool) return parsed;
                } catch (e) {
                    try {
                        const repaired = JSON.parse(this.repairJSON(blockMatch[1]));
                        if (repaired.tool) return repaired;
                    } catch (e2) { }
                }
            }

            // Fallback: Intelligent Brace Matcher avoiding strings
            const inlineMatch = cleanText.match(/\{[\s\n]*"tool"[\s\n]*:[\s\n]*"[^"]+"/);
            if (inlineMatch) {
                const start = text.indexOf(inlineMatch[0]);
                let depth = 0;
                let end = start;
                let inString = false;
                let isEscaped = false;

                for (let i = start; i < text.length; i++) {
                    const char = text[i];

                    if (char === '\\') {
                        isEscaped = !isEscaped;
                    } else {
                        if (char === '"' && !isEscaped) {
                            inString = !inString;
                        } else if (!inString) {
                            if (char === '{') depth++;
                            if (char === '}') depth--;
                        }
                        isEscaped = false;
                    }

                    if (depth === 0 && i > start && !inString) {
                        end = i + 1;
                        break;
                    }
                }

                if (end > start) {
                    const jsonStr = text.substring(start, end);
                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.tool) return parsed;
                    } catch (e) {
                        try {
                            const repaired = JSON.parse(this.repairJSON(jsonStr));
                            if (repaired.tool) return repaired;
                        } catch (e2) { }
                    }
                }
            }
        } catch (e) {
            console.error('[DEBUG] Tool extraction failed:', e.message);
        }
        return null;
    }

    /**
     * Reset conversation history
     */
    reset() {
        this.history = [];
        this.saveHistory();
        console.log('🔄 Conversation reset.');
    }
}
