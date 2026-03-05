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
import { logDebug, logDebugError } from './logger.js';
import { logAction } from './action-logger.js';

logDebug('[DEBUG] Loading core/agent.js...');

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
const STATE_PATH = path.join(__dirname, '..', 'STATE.md');

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
        this.activeMode = 'primary';

        const interrupted = this.checkInterruptedState();
        if (interrupted) {
            this.history.push({ role: 'system', content: `⚠️ Previous session was interrupted mid-execution:\n${interrupted}\nPlease inform the user.` });
        }
        this.clearState();
    }

    setMode(mode) {
        const STATIC_MODES = ['primary', 'plan', 'build', 'chat'];
        if (STATIC_MODES.includes(mode) || mode.startsWith('team-')) {
            this.activeMode = mode;
            return;
        }

        if (mode !== 'primary') {
            const adapterPath = `adapters/${mode}`;
            if (!fs.existsSync(path.join(__dirname, '..', adapterPath))) {
                console.log(`⚠️  [WARNING] Adapter for ${mode} not found at ${adapterPath}. Falling back to primary mode.`);
                this.activeMode = 'primary';
                return;
            }
        }

        this.activeMode = mode;
    }

    getAdapterPath() {
        if (this.activeMode === 'primary') return null;
        const adapterDir = path.join(__dirname, '..', `adapters/${this.activeMode}`);
        if (!fs.existsSync(adapterDir)) return null;
        return `adapters/${this.activeMode}`;
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
            'forecast': ['weather'],
            'knowledge': ['knowledge-base'],
            'save': ['knowledge-base'],
            'learn': ['knowledge-base'],
            'remember': ['knowledge-base'],
            'memory': ['knowledge-base'],
            'location': ['knowledge-base'],
            'skill': ['self-coder'],
            'coding': ['self-coder'],
            'script': ['self-coder', 'terminal'],
            'exam': ['self-coder'],
            'react': ['self-coder'],
            'component': ['self-coder'],
            'fix': ['self-coder', 'sys-admin'],
            'patch': ['self-coder'],
            'write': ['self-coder'],
            'implement': ['self-coder'],
            'create': ['self-coder'],
            'collab': ['collab-board'],
            'message': ['collab-board'],
            'scrape': ['web-scraper'],
            'read': ['self-coder', 'terminal'],
            'fetch': ['web-scraper'],
            'http': ['web-scraper'],
            'reddit': ['reddit-observer'],
            'subreddit': ['reddit-observer'],
            'youtube': ['youtube-analyst'],
            'video': ['youtube-analyst'],
            'transcript': ['youtube-analyst'],
            'obsidian': ['obsidian'],
            'note': ['obsidian'],
            'vault': ['obsidian'],
            'librarian': ['obsidian-librarian'],
            'consolidate': ['obsidian-librarian'],
            'scattered': ['obsidian-librarian'],
            'duplicate': ['obsidian-librarian'],
            'find': ['terminal', 'self-coder', 'obsidian-librarian'],
            'sprint': ['self-coder', 'terminal'],
            'project': ['self-coder', 'terminal'],
            'team': ['team-manager'],
            'handoff': ['team-manager'],
            'delegate': ['team-manager']
        };

        // Check last 2 messages for context persistence
        const recentHistory = (this.history || []).slice(-2).map(m => m.content).join(' ');
        const fullContext = (userMessage + ' ' + recentHistory).toLowerCase();

        for (const [kw, skills] of Object.entries(keywordMap)) {
            if (fullContext.includes(kw)) {
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
        console.log(`\n\n🚨 [DEBUG] process() CALLED! activeMode=${this.activeMode}\n\n`);
        let autoContinueFlag = false;
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
        logDebug(`[DEBUG] Memory: ${freeMB}MB, LowMem: ${lowMem}, is3B: ${is3B}`);

        // GREETING INTERCEPTOR (Stop 3B models from hallucinating tools for simple 'hi')
        const greetings = ['hi', 'hello', 'hey', 'greetings', 'reset'];
        let isSimpleGreeting = greetings.includes(cleanMessage.toLowerCase());

        // AUTO-MODE DETECTION
        if (this.activeMode === 'primary') {
            const lowerMsg = cleanMessage.toLowerCase();
            const planKeywords = ['design', 'architect', 'plan', 'outline', 'architecture'];
            const buildKeywords = ['write', 'implement', 'code', 'build', 'fix', 'script'];

            if (planKeywords.some(kw => lowerMsg.includes(kw))) {
                console.log(`🧠 Auto-detect: Switching to 'plan' mode`);
                this.setMode('plan');
            } else if (buildKeywords.some(kw => lowerMsg.includes(kw))) {
                console.log(`🧠 Auto-detect: Switching to 'build' mode`);
                this.setMode('build');
            }
        }

        // CHAT MODE: Bypass dynamic tool injection entirely to save tokens and avoid tool hallucinations
        // TEAM-MANAGER MODE: Only load management tools (strict delegation - Niki must not see execution tools)
        let dynamicTools;
        if (this.activeMode === 'chat') {
            dynamicTools = "";
        } else if (this.activeMode === 'team-manager') {
            dynamicTools = getToolDescriptionsForSkills(this.skills, ['team-manager']);
            console.log('🎯 [PM MODE] Tool isolation active. Niki can only see management tools.');
        } else {
            dynamicTools = this.dynamicSkillInjection(cleanMessage);
        }

        let finalPrompt = this.systemPrompt;

        // PAIRED SYSTEM PROMPTS (Reinforce the mode behavior)
        if (this.activeMode === 'chat') {
            finalPrompt = "You are in CHAT mode. You are a helpful conversational assistant. Talk naturally with the user. You do NOT have access to tools or skills in this mode, so do not try to use any. Focus on providing high-quality text-based answers.\n\n" + finalPrompt;
        } else if (this.activeMode === 'plan') {
            finalPrompt = "You are in PLAN mode. You are a senior software architect. Output ONLY Markdown architecture docs, outlines, and plans. Never write code blocks.\n\n" + finalPrompt;
        } else if (this.activeMode === 'build') {
            finalPrompt = "You are in BUILD mode. You are an expert software engineer. Output primarily production-ready code blocks. Explain briefly after.\n\n" + finalPrompt;
        } else if (this.activeMode.startsWith('team-')) {
            const roleName = this.activeMode.replace('team-', '');
            const teamPrompt = this.getTeamRolePrompt(roleName);
            finalPrompt = teamPrompt + '\n\n' + finalPrompt;

            const HANDOFF_PATH = path.join(__dirname, '..', 'HANDOFF.json');
            if (fs.existsSync(HANDOFF_PATH)) {
                try {
                    const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
                    finalPrompt += `\n\n## Handoff Context From Previous Agent\n${JSON.stringify(handoff, null, 2)}`;

                    // Auto-Return to PM Logic
                    if (handoff.return_to && handoff.return_to === 'team-manager') {
                        finalPrompt += `\n\n> [!CRITICAL INSTRUCTION]\n> When you have completed your objective or encountered an unresolvable error, you MUST yield control back to the Project Manager.\n> **Action Required**: Use the \`handoff_to\` tool with \`role: "team-manager"\` and a \`context\` message detailing your result.\n`;
                    }

                    // Hard Timer Interrupt Logic
                    const TIMER_PATH = path.join(__dirname, '..', 'TASK_TIMERS.json');
                    if (fs.existsSync(TIMER_PATH)) {
                        try {
                            const timers = JSON.parse(fs.readFileSync(TIMER_PATH, 'utf-8'));
                            const myTimer = timers[this.activeMode] || timers[this.activeMode.replace('team-', '')];
                            if (myTimer && new Date().getTime() > myTimer.expires_at) {
                                console.log(`🛑 [SYSTEM INTERRUPT] Timer expired for ${this.activeMode}. Injecting forced handoff.`);
                                finalPrompt += `\n\n# 🛑 [SYSTEM URGENT INTERRUPT]\n> **YOUR TIME LIMIT HAS EXPIRED.**\n> You have been working for ${myTimer.timeout_ms / 60000} minutes and must now check in with the Project Manager.\n> **MANDATORY ACTION**: You MUST immediately call \`handoff_to\` with \`role: "team-manager"\` to report your current partial progress. Do NOT attempt any further tasks.\n`;
                            }
                        } catch (e) { /* ignore */ }
                    }
                } catch (e) { /* ignore */ }
            }
        }

        if (lowMem || is3B) {
            logDebug('[DEBUG] Using optimized prompt for 3B/LowMem');
            finalPrompt = `You are Devon, a conversational AI assistant.
 1. Always respond with text for simple talk (hi, hello, etc.).
 2. ONLY use tools if you see them listed below under "AVAILABLE TOOLS".
 3. If no tools are listed, you cannot perform actions. Ask the user for details.
 4. Keep thinking <think> blocks under 10 words.
 5. To use a tool, you MUST output a valid JSON object in this exact format: {"tool": "tool_name", "args": {"param": "value"}}

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
        logDebug('[DEBUG] Notebook context injection complete.');

        const messages = [];

        // MLX Server rejects multiple system messages; convert any history system messages to user
        const cleanedHistory = this.history.map(msg =>
            msg.role === 'system' ? { role: 'user', content: `[SYSTEM MESSAGE]\n${msg.content}` } : msg
        );

        if (lowMem || is3B) {
            messages.push({ role: 'system', content: finalPrompt });
            messages.push(...cleanedHistory.slice(-10)); // Moderate context
        } else {
            messages.push({ role: 'system', content: finalPrompt });
            messages.push(...cleanedHistory);
        }
        logDebug('[DEBUG] Messages array prepared for LLM call.');

        // Prepare Model Routing
        const ROLE_MODEL_MAP = {
            'team-architect': { forceLocal: true },
            'team-coder': { forceLocal: true },
            'team-designer': { forceLocal: true },
            'team-qa': { forceLocal: true },
            'team-researcher': { forceLocal: true },
            'team-manager': { forceLocal: true, deepThinking: true } // PM runs on 9B model
        };

        const roleConfig = ROLE_MODEL_MAP[this.activeMode] ||
            (this.activeMode.startsWith('team-') ? { forceLocal: true } : {});

        const HANDOFF_PATH = path.join(__dirname, '..', 'HANDOFF.json');

        // Ensure sub-agents default back to 4B unless /think was provided on this specific request
        let forceDeepThinking = roleConfig.deepThinking || deepThinking;

        // Force 9B for team-manager (Niki)
        if (this.activeMode === 'team-manager') {
            forceDeepThinking = true;
            console.log('🧠 [PM MODE] Niki is running on 9B model.');
        }

        if (fs.existsSync(HANDOFF_PATH)) {
            try {
                const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
                if (handoff.requires_9b) {
                    console.log(`🚀 [ESCALATION] Handoff requires 9B model. Enabling deepThinking.`);
                    forceDeepThinking = true;
                }
            } catch (e) { /* ignore */ }
        }

        const isPrivate = this.isPrivateRequest(cleanMessage) || !!this.activeNotebook;

        const chatOptions = {
            forceLocal: isPrivate || !!this.activeNotebook,
            deepThinking: forceDeepThinking,
            maxTokens: 2048,
            adapterPath: this.getAdapterPath()
        };

        if (ROLE_MODEL_MAP[this.activeMode]) {
            const roleConfig = { ...ROLE_MODEL_MAP[this.activeMode] };
            // Graceful fallback: if cloud is requested but no API key, use local instead
            if (roleConfig.forceCloud && !process.env.GEMINI_API_KEY) {
                console.log(`⚠️  [WARNING] ${this.activeMode} wants cloud (Gemini) but GEMINI_API_KEY is not set. Falling back to local.`);
                delete roleConfig.forceCloud;
                delete roleConfig.cloudModel;
                roleConfig.forceLocal = true;
            }
            Object.assign(chatOptions, roleConfig);
        }

        // Get LLM response
        logDebug(`[DEBUG] Calling chat with ${messages.length} messages...`);
        logDebug(`[DEBUG] Full Messages: ${JSON.stringify(messages, null, 2)}`);
        console.log(`🔍 Context: ${finalPrompt.length} chars. Dynamic Tools: ${dynamicTools?.length || 0} chars.`);

        const response = await chat(messages, chatOptions);
        logDebug('[DEBUG] Chat response received.');

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

        let iterations = 0;
        const MAX_ITERATIONS = 15; // Increased for complex research chains

        while (true) {
            // Loop Detector: If response is mostly junk tokens, it's a hallucination loop
            const junkTokens = ['<unk>', '<s>', '</s>', '<|im_start|>', '<|im_end|>'];
            const junkCount = junkTokens.reduce((count, token) => {
                const matches = assistantText.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
                return count + (matches ? matches.length : 0);
            }, 0);

            if (junkCount > 5) {
                logDebugError('⚠️ [DEBUG] Gibberish loop detected! Blocking response.');
                assistantText = "I encountered a processing error (loop detected). How can I help you today?";
                isSimpleGreeting = true; // Treat as greeting to reset flow
            } else {
                // N-gram Repetition Detector (Catches rambling text loops without penalizing long code)
                const sentences = assistantText.match(/[^.!?\n]+[.!?\n]+/g) || [assistantText];
                const counts = {};
                for (const s of sentences) {
                    const trimmed = s.trim();
                    if (trimmed.length > 30) {
                        counts[trimmed] = (counts[trimmed] || 0) + 1;
                        if (counts[trimmed] > 3) {
                            logDebugError(`⚠️ [DEBUG] N-gram repetition loop detected! Blocking response. Repeating chunk: "${trimmed.substring(0, 30)}..."`);
                            assistantText = "I encountered a processing error (repetition loop detected). How can I help you today?";
                            isSimpleGreeting = true;
                            break;
                        }
                    }
                }
            }

            // If it's a greeting and the model tried to call a tool, strip the JSON to avoid showing it to user
            if (isSimpleGreeting) {
                assistantText = assistantText.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/ig, '').trim();
                assistantText = assistantText.replace(/\{[\s\n]*"tool"[\s\n]*:[\s\n]*"[^"]+"[\s\S]*?\}/g, '').trim();

                if (!assistantText) {
                    assistantText = "Hello! I'm Devon. How can I help you today?";
                }
            }

            // Check if LLM wants to call a tool (Bypass if it's a simple greeting or in chat mode to prevent hallucination)
            const isChatMode = this.activeMode === 'chat';
            let toolCall = (isSimpleGreeting || isChatMode) ? null : this.extractToolCall(assistantText);

            if (!toolCall || iterations >= MAX_ITERATIONS) {
                break;
            }
            iterations++;

            if (toolCall) {
                try {
                    process.stdout.write(`\n\x1b[1m\x1b[36m🔧 [AUTONOMOUS] Tool call detected (${iterations}/${MAX_ITERATIONS}): ${toolCall.tool}\x1b[0m\n`);
                    console.log(`🔧 Running ${toolCall.tool}...`);

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
                        ], { ...chatOptions, deepThinking: forceDeepThinking });

                        assistantText = followUp.text;
                        finalTps = followUp.tps;
                    } else {
                        if (this.activeMode === 'team-manager' && dynamicTools && !dynamicTools.includes(`- ${toolCall.tool}:`)) {
                            // Niki is isolated. Stop her from hallucinating execution tools.
                            throw new Error(`MANAGER PROTOCOL VIOLATION: You are strictly forbidden from using "${toolCall.tool}". You must delegate this task using 'handoff_to' or 'delegate_task'.`);
                        }

                        this.writeState(toolCall.tool, toolCall.args, cleanMessage);
                        this.emit('tool_start', { tool: toolCall.tool, args: toolCall.args });
                        const result = await executeTool(this.skills, toolCall.tool, toolCall.args);
                        logDebug(`[DEBUG] Tool execution successful. Result: ${JSON.stringify(result)}`);
                        this.emit('tool_end', { tool: toolCall.tool, result });

                        // Log major actions
                        const IGNORED_TOOLS = ['get_task_timer', 'get_team_status', 'monitor_resources', 'obsidian_list_notes', 'read_file', 'list_dir', 'search_files', 'find_code_item'];
                        if (!IGNORED_TOOLS.includes(toolCall.tool)) {
                            // stringify args safely for log briefly
                            const briefArgs = JSON.stringify(toolCall.args).substring(0, 100);
                            logAction("TOOL_EXECUTION", `Executed tool \`${toolCall.tool}\` - Args: ${briefArgs}`, this.activeMode);
                        }

                        // Handle mode switch from team-manager
                        if (result && result.next_mode) {
                            console.log(`🔄 Tool requested mode switch to: ${result.next_mode}`);
                            this.setMode(result.next_mode);
                        }

                        if (result && result.auto_continue) {
                            autoContinueFlag = true;
                        }

                        this.clearState();

                        // Check for escalation from tool result
                        if (result && result.deep_thinking) {
                            forceDeepThinking = true;
                        }

                        // Check for explicit error return from tool
                        if (result && result.error) {
                            const errorId = errorManager.logError(result.error, `Tool call: ${toolCall.tool}`);
                            // Append Error ID to the result so the agent knows about it
                            result.error_id = errorId;
                            result.system_note = `System logged error as ${errorId}. You should verify this error using read_file then fix it.`;
                        }

                        // Feed tool result back to LLM for natural response
                        const PM_MANAGEMENT_TOOLS = ['save_plan', 'get_next_step', 'mark_step_done', 'set_task_timer', 'get_team_status', 'monitor_resources', 'delegate_task'];
                        const isPmManagementCall = this.activeMode === 'team-manager' && PM_MANAGEMENT_TOOLS.includes(toolCall.tool);

                        let toolResultMsg = `Tool "${toolCall.tool}" returned:\n${JSON.stringify(result, null, 2)}`;

                        // PM Stepping Loop: nudge Niki with strict state machine transitions
                        if (isPmManagementCall) {
                            if (result && result.error) {
                                toolResultMsg += `\n\n[SYSTEM WARNING] The tool failed. You MUST correct your arguments and try again.`;
                                console.log(`🔄 [PM STEP] Guiding Niki to retry after error in ${toolCall.tool}...`);
                            } else {
                                let nudge = `\n\n[SYSTEM] Tool executed successfully. Do NOT ask the user for confirmation.`;
                                if (toolCall.tool === 'save_plan') {
                                    nudge += ` MANDATORY NEXT STEP: You MUST now call get_next_step to load the first pending task.`;
                                } else if (toolCall.tool === 'get_next_step') {
                                    if (result && result.plan_status === 'complete') {
                                        nudge += ` The plan is complete. You may now summarize the final results to the user.`;
                                    } else {
                                        nudge += ` MANDATORY NEXT STEP: You MUST now call set_task_timer for the assigned role, or immediately call handoff_to if timer is already set.`;
                                    }
                                } else if (toolCall.tool === 'set_task_timer') {
                                    nudge += ` MANDATORY NEXT STEP: You MUST now call handoff_to to yield control to the assigned worker.`;
                                } else if (toolCall.tool === 'mark_step_done') {
                                    nudge += ` MANDATORY NEXT STEP: You MUST now call get_next_step to find the next pending task.`;
                                } else {
                                    nudge += ` Continue your Standard Operating Procedure.`;
                                }
                                toolResultMsg += nudge;
                                console.log(`🔄 [PM STEP] Guiding Niki to next state after ${toolCall.tool}...`);
                            }
                        }

                        this.history.push({ role: 'assistant', content: assistantText });
                        this.history.push({ role: 'user', content: toolResultMsg });

                        const followUp = await chat([
                            { role: 'system', content: finalPrompt },
                            ...this.history
                        ], { ...chatOptions, deepThinking: forceDeepThinking });

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

                    break; // Break loop on critical execution error
                }
            } // End of if (toolCall)
        } // End of while loop

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

        // If we are auto-continuing (handoff), clear history for the next agent
        // to prevent context window bloat in 7B models.
        if (autoContinueFlag) {
            console.log('🧹 Clearing history for autonomous handoff...');
            this.history = [];
        }

        this.saveHistory();
        this.emit('message', { role: 'assistant', content: assistantText, model: modelUsed });

        // Phase 7: Forced Agent Auto-Return (Structural Safety Net)
        // If the agent is in a sub-team mode, didn't use handoff_to (autoContinueFlag is false),
        // but HANDOFF.json says they should return to team-manager, we force it here.
        if (!autoContinueFlag && this.activeMode.startsWith('team-') && this.activeMode !== 'team-manager') {
            const HANDOFF_PATH = path.join(__dirname, '..', 'HANDOFF.json');
            if (fs.existsSync(HANDOFF_PATH)) {
                try {
                    const currentHandoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
                    if (currentHandoff.return_to === 'team-manager') {
                        console.log(`\n🛡️ [SAFETY NET] ${this.activeMode} finished without calling handoff_to. Forcing auto-return to team-manager.`);

                        const forcedHandoff = {
                            from: this.activeMode,
                            to: 'team-manager',
                            context: `[AUTOGENERATED RETURN] The ${this.activeMode} agent completed their task and returned this final output: "${assistantText}"`
                        };

                        fs.writeFileSync(HANDOFF_PATH, JSON.stringify(forcedHandoff, null, 2));
                        autoContinueFlag = true;

                        // Clear history for autonomous handoff
                        console.log('🧹 Clearing history for forced autonomous handoff...');
                        this.history = [];
                    }
                } catch (e) {
                    console.error('⚠️ [SAFETY NET] Failed to parse HANDOFF.json during auto-return check:', e.message);
                }
            }
        }

        // Check if we resolved an error (simple heuristic or explicit tool call in future)
        // If the assistant says "I have fixed...", we could try to resolve? 
        // For now, rely on manual "resolve_error" tool if we had one, or let user confirm.

        return { text: assistantText, model: modelUsed, tps: finalTps, auto_continue: autoContinueFlag };
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

        // 0. Convert single quotes surrounding string values into double quotes.
        // This regex looks for `: '...'` and replaces it with `: "..."`
        repaired = repaired.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"');

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

    /**
     * Write execution state before tool calls for crash recovery
     */
    writeState(toolName, args, userMessage) {
        const state = [
            '# Prometheus Execution State',
            `> Auto-generated. If you see this file, it means execution was interrupted.`,
            '',
            `**Timestamp:** ${new Date().toISOString()}`,
            `**Active Tool:** ${toolName}`,
            `**User Message:** ${userMessage}`,
            `**Args:** \`${JSON.stringify(args)}\``,
            `**Status:** IN_PROGRESS`
        ].join('\n');
        try {
            fs.writeFileSync(STATE_PATH, state);
        } catch (e) {
            console.error('⚠️ Failed to write STATE.md:', e.message);
        }
    }

    clearState() {
        try {
            if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
        } catch (e) { /* ignore */ }
    }

    checkInterruptedState() {
        try {
            if (fs.existsSync(STATE_PATH)) {
                const content = fs.readFileSync(STATE_PATH, 'utf-8');
                if (content.includes('IN_PROGRESS')) {
                    console.log('⚠️ Detected interrupted execution from previous session.');
                    console.log(content);
                    return content;
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Get a specialized persona prompt for a team role
     */
    getTeamRolePrompt(roleName) {
        let basePrompt = "";

        // Load Base Definition from ROLES.md
        const ROLES_PATH = path.join(__dirname, '..', 'ROLES.md');
        if (fs.existsSync(ROLES_PATH)) {
            const content = fs.readFileSync(ROLES_PATH, 'utf-8');
            const sections = content.split('---');
            for (const section of sections) {
                // Match exact roles (e.g., [Engine-Coder]) or explicitly defined Modes like `team-manager`
                const normalizedSection = section.toLowerCase();
                if (normalizedSection.includes(`mode**: \`team-${roleName.toLowerCase()}\``) ||
                    normalizedSection.includes(`mode:** \`team-${roleName.toLowerCase()}\``) ||
                    normalizedSection.match(new RegExp(`\\[.*${roleName}.*\\]`, 'i'))) {
                    basePrompt = section.trim();
                    break;
                }
            }
        }

        // Load Specialized Embedded Prompt if it exists (e.g., Decision Trees)
        // Check both `team-roleName.md` and `roleName.md`
        const pathsToTry = [
            path.join(__dirname, '..', `prompts/team-${roleName}.md`),
            path.join(__dirname, '..', `prompts/${roleName}.md`),
            path.join(__dirname, '..', `roles/team-${roleName}.md`),
            path.join(__dirname, '..', `roles/${roleName}.md`)
        ];

        for (const promptPath of pathsToTry) {
            if (fs.existsSync(promptPath)) {
                const specialContent = fs.readFileSync(promptPath, 'utf-8');
                basePrompt += `\n\n${specialContent}`;
                break;
            }
        }

        return basePrompt;
    }
}
