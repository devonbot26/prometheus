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
import { loadSkills, executeTool, getToolDescriptions, getSkillSummaries, getToolDescriptionsForSkills, getSpecificToolDescriptions } from './skill-loader.js';
import { buildSystemPrompt } from './identity.js';
import { quotaTracker } from './quota-tracker.js';
import { errorManager } from './error-manager.js';
import { logDebug, logDebugError } from './logger.js';
import { logAction } from './action-logger.js';
import { resolveIntent, registerIntent } from './decision-tree.js';
import { mcpManager } from './mcp-client.js';
import { QUOTA_TIERS, quotaManager } from './quota-manager.js';
import { memoryManager } from './memory-manager.js';
import { StreamWatchdog } from './loop-watchdog.js';

logDebug('[DEBUG] Loading core/agent.js...');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getFreeMemMB() {
    try {
        if (os.platform() === 'darwin') {
            const output = execSync('vm_stat').toString();
            const pageSize = 16384; 
            const free = parseInt(output.match(/Pages free:\s+(\d+)/)[1]);
            const inactive = parseInt(output.match(/Pages inactive:\s+(\d+)/)[1]);
            const speculative = parseInt(output.match(/Pages speculative:\s+(\d+)/)[1]);
            const purgeable = parseInt(output.match(/Pages purgeable:\s+(\d+)/)[1]);
            return Math.floor(((free + inactive + speculative + purgeable) * pageSize) / (1024 * 1024));
        }
        return Math.floor(os.freemem() / (1024 * 1024));
    } catch (e) {
        return Math.floor(os.freemem() / (1024 * 1024));
    }
}
const HISTORY_PATH = path.join(__dirname, 'history.json');
const STATE_PATH = path.join(__dirname, '..', 'STATE.md');
const AGENT_STATE_PATH = path.join(__dirname, '.agent_state.json');
const PLAN_CONTEXT_PATH = path.join(__dirname, '.plan_context.json');

import { EventEmitter } from 'events';

export const ROLE_MODEL_MAP = {
    'team-architect': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, maxTokens: 4096 },
    'team-coder': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, maxTokens: 4096 },
    'team-designer': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, maxTokens: 4096 },
    'team-qa': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, maxTokens: 4096 },
    'team-researcher': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, maxTokens: 4096 },
    'team-manager': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, deepThinking: true, maxTokens: 4096 },
    'team-assistant': { modelId: process.env.LLM_MODEL_HEAVY || process.env.LLM_MODEL, forceLocal: true, maxTokens: 4096 }
};

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
        this.activeNotebook = null;
        this.memoryState = 'healthy';
        this.taskStartedAt = null;
        this.showThinking = process.env.SHOW_THINKING !== 'false';
        this.disabledSkills = new Set();

        this.config = {
            self_healing: process.env.SELF_HEALING_ENABLED !== 'false'
        };

        this.processing = false;
        this.abortController = null;
        this.loadAgentState();
        this.loadPlanContext();

        const interrupted = this.checkInterruptedState();
        if (interrupted) {
            console.log(`⚠️  [AGENT] Previous session was interrupted. State: ${interrupted}`);
        }
        this.clearState();
        this.progressState = ""; // Pinned task progress for context preservation
        this.watchdog = new StreamWatchdog();
    }

    /**
     * Register external skills (like those from MCP)
     * @param {Map} externalSkills 
     */
    registerExternalSkills(externalSkills) {
        for (const [name, data] of externalSkills) {
            this.skills.set(name, data);

            // Register with decision tree if intent schema exists
            if (data.meta && data.meta.intent) {
                registerIntent(name, data.meta.intent);
            }

            logDebug(`[DEBUG] Registered external skill: ${name}`);
        }
        // Update summaries
        this.skillSummaries = getSkillSummaries(this.skills);
    }

    setMode(mode) {
        const STATIC_MODES = ['primary', 'plan', 'build', 'chat'];
        if (STATIC_MODES.includes(mode) || mode.startsWith('team-')) {
            this.activeMode = mode;
            this.saveAgentState();
            return;
        }

        if (mode !== 'primary') {
            const adapterPath = `adapters/${mode}`;
            if (!fs.existsSync(path.join(__dirname, '..', adapterPath))) {
                console.log(`⚠️  [WARNING] Adapter for ${mode} not found at ${adapterPath}. Falling back to primary mode.`);
                this.activeMode = 'primary';
                this.saveAgentState();
                return;
            }
        }

        this.activeMode = mode;
        this.saveAgentState();
    }

    loadAgentState() {
        try {
            if (fs.existsSync(AGENT_STATE_PATH)) {
                const state = JSON.parse(fs.readFileSync(AGENT_STATE_PATH, 'utf-8'));
                if (state.activeMode) {
                    this.activeMode = state.activeMode;
                    console.log(`🧠 [STATE] Restored activeMode: ${this.activeMode}`);
                }
            }
        } catch (e) {
            console.error('⚠️ Failed to load agent state:', e.message);
        }
    }

    saveAgentState() {
        try {
            fs.writeFileSync(AGENT_STATE_PATH, JSON.stringify({
                activeMode: this.activeMode,
                timestamp: new Date().toISOString()
            }, null, 2));
        } catch (e) {
            console.error('⚠️ Failed to save agent state:', e.message);
        }
    }

    loadPlanContext() {
        const pmStatePath = path.resolve(process.cwd(), 'PM_STATE.json');
        if (fs.existsSync(pmStatePath) && fs.existsSync(PLAN_CONTEXT_PATH)) {
            try {
                const context = JSON.parse(fs.readFileSync(PLAN_CONTEXT_PATH, 'utf-8'));
                if (context.history && context.history.length > 0) {
                    // Filter out messages that are already in this.history to avoid duplication
                    const newMessages = context.history.filter(ctxMsg => 
                        !this.history.some(histMsg => 
                            histMsg.role === ctxMsg.role && histMsg.content === ctxMsg.content
                        )
                    );
                    
                    if (newMessages.length > 0) {
                        console.log(`🧠 [STATE] Restoring plan context (${newMessages.length} new msgs)`);
                        this.history = [...newMessages, ...this.history];
                    }
                }
            } catch (e) {
                console.error('⚠️ Failed to load plan context:', e.message);
            }
        }
    }

    savePlanContext() {
        try {
            // Save the last few important messages (usually the plan and user approval)
            const planMsgs = this.history.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4);
            fs.writeFileSync(PLAN_CONTEXT_PATH, JSON.stringify({
                history: planMsgs,
                timestamp: new Date().toISOString()
            }, null, 2));
        } catch (e) {
            console.error('⚠️ Failed to save plan context:', e.message);
        }
    }

    toggleSkill(name, enabled) {
        if (enabled) {
            this.disabledSkills.delete(name);
        } else {
            this.disabledSkills.add(name);
        }
        console.log(`🔧 [AGENT] Skill "${name}" is now ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Interrupts the currently active process and tool execution loop.
     */
    stop() {
        if (this.processing && this.abortController) {
            console.log('🛑 [AGENT] Stop signal received. Aborting current process...');
            this.abortController.abort();
            this.emit('log', '🛑 Process interrupted by user.');
        } else {
            console.log('⚠️ [AGENT] Stop signal received but no process is active.');
        }
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
    async dynamicSkillInjection(userMessage) {
        // 1. Resolve Intent via Smart Decision Tree v3
        const recentHistory = this.history.slice(-3).map(m => m.content).join(' ');
        
        // Track the last error from history for self-healing triggers
        const lastAssistantMsg = this.history.findLast(m => m.role === 'assistant');
        let lastError = null;
        if (lastAssistantMsg && lastAssistantMsg.content.includes('"error":')) {
            try {
                const match = lastAssistantMsg.content.match(/"error":\s*"([^"]+)"/);
                if (match) lastError = match[1];
            } catch (e) { /* silent */ }
        }

        const { skills: rawDetectedSkills, debug } = await resolveIntent(userMessage, recentHistory, this.skills, lastError);
        
        // Filter out disabled skills
        const detectedSkills = rawDetectedSkills.filter(s => !this.disabledSkills.has(s));

        // Autonomous Escalation: If we detect a loop (repeats >= 3), force escalate to heavy model
        if (debug && debug.loops >= 3 && process.env.LLM_MODEL_HEAVY && process.env.LLM_MODEL !== process.env.LLM_MODEL_HEAVY) {
            console.log(`\n🚀 [AUTO-ESCALATION] Intent loop detected. Promoting session to heavy reasoning model.`);
            this.loopEscalationActive = true; 
        } else {
            this.loopEscalationActive = false;
        }

        if (debug) {
            this.emit('intent_trace', debug);
        }

        // GEP Gene: Persistent Base Skills for Team Roles
        if (this.activeMode.startsWith('team-')) {
            const baseSkills = ['terminal', 'self-coder', 'sys-admin', 'gmail', 'search'];
            baseSkills.forEach(s => {
                if (!detectedSkills.includes(s) && this.skills.has(s)) {
                    detectedSkills.push(s);
                }
            });
        }

        if (detectedSkills.length > 0) {
            console.log(`\x1b[32m✅ Loading full schema on-demand: ${detectedSkills.join(', ')}\x1b[0m`);
            let injection = getToolDescriptionsForSkills(this.skills, detectedSkills);

            // SPECIAL OVERRIDE: 9B models need explicit schema for sensitive tools
            if (detectedSkills.includes('youtube-downloader') && !injection.includes('download_youtube_mp3')) {
                injection += '\n' + getToolDescriptionsForSkills(this.skills, ['youtube-downloader']);
            }

            // EXTRA CONTEXT: Inject Project Paths if we detected a project mention
            const { projectIndexer } = await import('../services/project-indexer.js');
            const projects = projectIndexer.getProjectNames();
            const lowerMsg = userMessage.toLowerCase();
            const mentioned = projects.filter(p => lowerMsg.includes(p.toLowerCase()));

            if (mentioned.length > 0) {
                injection += `\n\n## 📁 LOCAL PROJECT DIRECTORY\nYou are currently at: Documents/projects/Prometheus\nThe following projects are also available in sibling folders (../[name]):\n`;
                mentioned.forEach(p => {
                    const meta = projectIndexer.getProjectMetadata(p);
                    injection += `- ${p} (Path: ../${p}, Lang: ${meta?.lang || 'unknown'})\n`;
                });
            }

            return injection;
        }

        return "";
    }

    /**
     * Process a user message and return the assistant's response
     * @param {string} userMessage
     * @param {string} tier The quota tier (INTERACTIVE or AUTOMATED)
     * @param {function} streamCallback Optional callback for real-time text/reasoning tokens
     */
    async process(userMessage, tier = QUOTA_TIERS.INTERACTIVE, streamCallback = null) {
        this.taskStartedAt = Date.now();
        console.log(`\n\n🚨 [DEBUG] process() CALLED! activeMode=${this.activeMode} tier=${tier}\n\n`);

        if (this.processing) {
            const errorMsg = "⚠️ [MUTEX] Agent is currently busy processing another task. Please wait.";
            console.warn(errorMsg);
            throw new Error("AGENT_BUSY");
        }

        this.processing = true;
        this.abortController = new AbortController();

        // Quota Guard Check
        if (!quotaManager.allow(tier)) {
            const status = quotaManager.getStatus();
            let msg = "⚠️ [QUOTA GUARD] Request denied.";
            if (status.safeMode) {
                msg += ` Safe Mode active (Backing off 429). Retry in ${status.safeModeRemaining}s.`;
            } else {
                msg += ` Automated limit reached (${status.automatedCount}/${status.limit}).`;
            }
            console.warn(msg);
            this.emit('log', msg);
            throw new Error("QUOTA_EXCEEDED");
        }

        quotaManager.recordRequest(tier);

        this.processing = true;

        try {
            let autoContinueFlag = false;
            let sanitizationMetadata = { raw: '', strips: [] };
            // Detect Deep Thinking Command
            let deepThinking = false;
            let assistantText = '';
            let isSimpleGreeting = false;
            let isUtility = false;
            const startTime = Date.now();
            let cleanMessage = userMessage; 
            
            const ASSISTANT_SKILLS = ['gmail', 'weather', 'web-search', 'obsidian', 'knowledge-base', 'terminal'];
            const UTILITY_KEYWORDS = ['email', 'search', 'email', ...ASSISTANT_SKILLS];

            const lowerMsg = userMessage.toLowerCase().trim();

            // Phase 51: /clear Command Interceptor
            if (lowerMsg === '/clear') {
                console.log('🧹 [COMMAND] "/clear" detected. Wiping chat history...');
                this.history = [];
                this.saveHistory(); 
                
                this.processing = false;
                this.emit('message', {
                    role: 'assistant',
                    content: "🧹 Chat history cleared.",
                    model: 'system-guard'
                });
                
                return {
                    text: "🧹 Chat history cleared.",
                    model: 'system-guard'
                };
            }

            console.log(`🔍 [ROUTING DEBUG] userMessage starts with: "${userMessage.substring(0, 50)}...", lowerMsg starts with: "${lowerMsg.substring(0, 50)}..."`);
            if (lowerMsg.startsWith('niki')) {
                console.log(`🧠 [ROUTING] Explicit Niki prefix detected. Switching to 'team-manager' mode.`);
                this.setMode('team-manager');
                cleanMessage = userMessage.replace(/^niki[,:\s]*/i, '').trim();
            } else if (lowerMsg.startsWith('devon')) {
                console.log(`🧠 [ROUTING] Explicit Devon prefix detected. Switching to 'team-coder' mode.`);
                this.setMode('team-coder');
                cleanMessage = userMessage.replace(/^devon[,:\s]*/i, '').trim();
            } else if (this.activeMode === 'primary') {
                // Default to Devon (team-coder) if in primary mode and no prefix
                console.log(`🧠 [ROUTING] No prefix detected in primary mode. Defaulting to 'team-coder' (Devon).`);
                this.setMode('team-coder');
            }

            // Phase 49: Utility Routing Override (Bypass Niki for Assistant tasks)
            const isUtilityRequest = UTILITY_KEYWORDS.some(skill => lowerMsg.includes(skill.toLowerCase()));
            
            if (isUtilityRequest && this.activeMode === 'team-manager' && !lowerMsg.startsWith('niki')) {
                console.log(`🧠 [ROUTING] Utility request detected ("${lowerMsg}"). Overriding Niki to Devon.`);
                this.setMode('team-coder');
            }

            const isPrivate = this.isPrivateRequest(cleanMessage) || !!this.activeNotebook;

            if (cleanMessage.startsWith('/think ')) {
                deepThinking = true;
                cleanMessage = cleanMessage.replace('/think ', '');
                console.log('🧠 Deep Thinking mode activated for this request.');
            }

            // Add user message to history
            this.history.push({ role: 'user', content: cleanMessage });

            // Detect Low Memory State
            const freeMB = getFreeMemMB();
            const disableCompressed = process.env.DISABLE_COMPRESSED_PROMPT === 'true';
            const lowMem = freeMB < 500 && !disableCompressed;
            const ultraLowMem = freeMB < 200 && !disableCompressed;

            // Fix 9: Check the active role's model, not the env default
            const activeRoleModel = ROLE_MODEL_MAP[this.activeMode]?.modelId || process.env.LLM_MODEL || '';
            const is9B = activeRoleModel.includes('9B') || activeRoleModel.toLowerCase().includes('nanbeige');
            logDebug(`[DEBUG] Memory: ${freeMB}MB, LowMem: ${lowMem}, UltraLow: ${ultraLowMem}, is9B: ${is9B}`);

            // GREETING INTERCEPTOR (Stop 9B models from hallucinating tools for simple 'hi')
            const greetings = ['hi', 'hello', 'hey', 'greetings', 'reset'];
            isSimpleGreeting = greetings.includes(cleanMessage.toLowerCase());
            
            // Phase 5: Early Utility Detection for Routing & Pruning
            isUtility = /\b(gmail|email|weather|search)\b/i.test(lowerMsg);

            // Phase 50: Low-Latency Routing (Route simple greetings to 2B)
            if (isSimpleGreeting && !deepThinking) {
                console.log(`⚡ [ROUTING] Simple greeting detected. Will use Fast 2B model.`);
            }

            // AUTO-MODE DETECTION (Secondary check for keywords if in primary)
            if (this.activeMode === 'primary') {
                const teamKeywords = ['team', 'handoff', 'delegate', 'manager', 'niki', 'setup the team'];
                const planKeywords = ['design', 'architect', 'plan', 'outline', 'architecture'];
                const buildKeywords = ['write', 'implement', 'code', 'build', 'fix', 'script'];

                if (teamKeywords.some(kw => lowerMsg.includes(kw))) {
                    console.log(`🧠 Auto-detect: Switching to 'team-manager' mode`);
                    this.setMode('team-manager');
                } else if (planKeywords.some(kw => lowerMsg.includes(kw))) {
                    console.log(`🧠 Auto-detect: Switching to 'plan' mode`);
                    this.setMode('plan');
                } else if (buildKeywords.some(kw => lowerMsg.includes(kw))) {
                    console.log(`🧠 Auto-detect: Switching to 'build' mode`);
                    this.setMode('build');
                }
            }

            // CHAT MODE: Bypass dynamic tool injection entirely to save tokens and avoid tool hallucinations
            // TEAM-MANAGER MODE & SUB-AGENTS: Load specific skills + Global Assistant Skills
            let dynamicTools;

            // Phase 17: Resolve Dynamic Tools First
            let detectionInjection = "";
            if (!['chat', 'prompt-engineer'].includes(this.activeMode)) {
                detectionInjection = await this.dynamicSkillInjection(cleanMessage);
            }

            if (this.activeMode === 'chat') {
                dynamicTools = "";
            } else if (this.activeMode === 'prompt-engineer') {
                dynamicTools = "";
                console.log('📝 [DRAFT MODE] Zero tools active. Prometheus is strictly meta-prompting.');
            } else if (this.activeMode === 'team-manager') {
                dynamicTools = getToolDescriptionsForSkills(this.skills, ['team-manager', 'opencode', ...ASSISTANT_SKILLS]) + '\n' + detectionInjection;
                console.log('🎯 [PM MODE] Tool isolation active. Niki can see management, opencode, and assistant tools + detected skills.');
            } else if (this.activeMode.startsWith('team-')) {
                // Phase 17: Strict Tool Masking for Sub-Agents (Devon/Architect/etc)
                // Filter ASSISTANT_SKILLS and base skills to avoid duplication with detectionInjection
                const intentRes = await resolveIntent(cleanMessage, this.history.slice(-3).map(m => m.content).join(' '), this.skills);
                const detectedSkills = intentRes.skills;
                const filteredBase = ['terminal', 'self-coder', 'sys-admin', 'gmail', 'search'].filter(s => !detectedSkills.includes(s));
                
                const baseTools = getToolDescriptionsForSkills(this.skills, filteredBase);
                
                // DELEGATION RULE: Only Niki (team-manager) can delegate. Devon (team-coder) works directly.
                if (this.activeMode === 'team-coder' || this.activeMode === 'team-qa') {
                    console.log(`🎯 [DIRECT MODE] Removing delegation tools for ${this.activeMode}. Including detected skills.`);
                    dynamicTools = baseTools + '\n' + detectionInjection;
                } else {
                    const pmTools = getSpecificToolDescriptions(this.skills, ['handoff_to', 'escalate_to_9b']);
                    dynamicTools = baseTools + '\n' + pmTools + '\n' + detectionInjection;
                    console.log(`🎯 [SUB-AGENT MODE] Expanded Tool Masking active for ${this.activeMode}. Including detected skills.`);
                }
            } else {
                dynamicTools = detectionInjection;
            }

            // Phase 17: Build the base system prompt. Strip global skills for Sub-Agents to prevent pollution.
            let basePrompt = this.systemPrompt;
            if (this.activeMode.startsWith('team-') && this.activeMode !== 'team-manager') {
                basePrompt = buildSystemPrompt("You are operating in a specialized team role. You have FULL ACCESS to the tools listed below under 'AVAILABLE TOOLS' and you should use them proactively to fulfill the request.");
            }
            
            // Inject Reasoning Prompt for 2B model
            const is2B = this.activeMode === 'team-assistant' || (process.env.LLM_MODEL && process.env.LLM_MODEL.includes('2B'));
            if (is2B && process.env.LLM_REASONING_PROMPT) {
                console.log('🧠 Injecting optimized reasoning prompt for 2B model.');
                basePrompt = `${process.env.LLM_REASONING_PROMPT}\n\n${basePrompt}`;
            }

            // Phase 18: Scored Memory Injection
            const relevantMemories = memoryManager.getTopMemoriesForContext(cleanMessage);
            let memorySnippet = "";
            if (relevantMemories.length > 0) {
                memorySnippet = "\n\n## 🧠 RECALLED MEMORIES (Historical Context)\n" + 
                                relevantMemories.map(m => `- [Score: ${m.score}, Age: ${Math.round(m.ageDays)}d] ${m.fact}`).join('\n');
            }

            let finalPrompt = `## 🧠 PROJECT CONTEXT: PROMETHEUS
You are **PROMETHEUS**, a highly advanced agentic AI orchestrator. 
- **WORKSPACE PATHS**:
    - Project Root: ${process.env.PROJECT_ROOT || 'Not Set'}
    - Documents Root (Vault): ${process.env.DOCUMENTS_ROOT || 'Not Set'}
- **CRITICAL**: The current workspace IS the "Prometheus" project.
- **DISCOVERY RULE**: For any query about a project (including "Prometheus"), you MUST first check:
    1. Your **Memory** (history).
    2. Your **Knowledge Base** (query_knowledge or .knowledge/ folder).
    3. The **Projects Folder** (projects/ directory).
- **PRIORITIZATION**: If found internally, ALWAYS prioritize local documentation (README.md, ROLES.md) and code analysis over 'web_search'.\n\n` + basePrompt + memorySnippet;

            // PAIRED SYSTEM PROMPTS (Reinforce the mode behavior)
            if (this.activeMode === 'prompt-engineer') {
                finalPrompt = "You are an Expert Prompt Engineer. The user will give you a rough idea or objective. You must ask 1-2 highly specific technical questions to clarify the scope, edge cases, and architecture. Once the user answers, you must generate a comprehensive, highly-detailed final prompt that the user can send to an Agentic AI system for execution. You MUST output your final prompt inside a ```prompt-draft``` block.\n\n" + finalPrompt;
            } else if (this.activeMode === 'chat') {
                finalPrompt = "You are in CHAT mode. You are a helpful conversational assistant. Talk naturally with the user. You do NOT have access to tools or skills in this mode, so do not try to use any. Focus on providing high-quality text-based answers.\n\n" + finalPrompt;
            } else if (this.activeMode === 'team-manager') {
                // Inject Priority Matrix Reinforcement for PM Mode
                const hasPlanKeywords = cleanMessage.toLowerCase().match(/\b(plan|list|steps|orchestrate)\b/);
                const nikiPersona = hasPlanKeywords 
                    ? "As Project Manager, your primary goal is to **LEAD THE TEAM**. Research the task, create a comprehensive plan using `save_plan`, and then `handoff_to` the appropriate Tier 1 or Tier 2 worker. **AUTONOMY**: Once the user approves a plan, proceed through ALL steps autonomously without further confirmation."
                    : "As a Direct Executor, perform the requested task yourself using your available tools (Email, Weather, Search, etc.). Only delegate if the task becomes complex or requires coding.";

                finalPrompt = `## 📊 NIKI'S ACTIVE PERSONA
${nikiPersona}

### TIERED PRIORITY MATRIX
- **TIER 1 (OpenCode)**: DEFAULT for ALL Coding/Architecture/Maze logic. USE 'handoff_to_opencode'.
- **TIER 2 (Devon)**: ONLY for Prometheus system maintenance, skill updates, or as a FAILOVER if Tier 1 fails. USE 'handoff_to'.
- **TIER 3 (Niki)**: YOU are Tier 3. Audit results and manage the plan.

> [!DECISION RULE]: If the task is general coding (Pac-Man logic, UI, engine), ALWAYS use Tier 1. Only use Tier 2 for updating "Prometheus" files or fixing internal skills/tools.
\n\n` + finalPrompt;
            } else if (this.activeMode === 'plan') {
                const isMedia = (cleanMessage.toLowerCase() + (dynamicTools || '')).includes('youtube') || (cleanMessage.toLowerCase() + (dynamicTools || '')).includes('mp3');
                if (!isMedia) {
                    finalPrompt = "You are in PLAN mode. You are a senior software architect. Use your tools (like 'query_knowledge' and 'save_plan') to research and document architecture. Output your findings as Markdown, but DO use tool blocks when actions are required. Never write implementation code blocks.\n\n" + finalPrompt;
                } else {
                    console.log('⚡ [PLAN EXEMPTION] Allowing tool execution for media download despite PLAN mode.');
                }
            } else if (this.activeMode === 'build') {
                finalPrompt = "You are in BUILD mode. You are an expert software engineer. Focus on implementation. Output production-ready code blocks for the logic requested.\n\n" + finalPrompt;
            }

            // Phase 35: Inject Pinned Progress State (If any)
            if (this.progressState) {
                finalPrompt = `## 📌 CURRENT PROGRESS (Pinned State):\n${this.progressState}\n\n` + finalPrompt;
            }

            // Step 1: Stateful Memory Injection (PM_STATE.json)
            if (this.activeMode.startsWith('team-')) {
                const roleName = this.activeMode.replace('team-', '');
                let teamPrompt = this.getTeamRolePrompt(roleName);
                
                // Devon Specific Reinforcement
                if (this.activeMode === 'team-coder') {
                    teamPrompt = `## 👤 YOUR IDENTITY: DEVON
You are **Devon**, Nelson Wong's direct personal assistant. 
- **DIRECT ACTION**: You MUST perform all tasks yourself using your available tools.
- **NO DELEGATION**: You are forbidden from delegating tasks to Niki or any other role.
- **FAILURE PROTOCOL**: If you cannot complete a task due to errors, missing tools, or complexity, you MUST report this failure directly to Nelson Wong. do NOT try to handoff the problem to Niki. Nelson will decide how to proceed.
- **NO HANDOFF**: When done (successfully or with a failure report), simply answer the user directly. Do not "wait for review".\n\n` + teamPrompt;
                }
                
                finalPrompt = teamPrompt + '\n\n' + finalPrompt;

                const PM_STATE_PATH = path.join(__dirname, '..', 'PM_STATE.json');
                if (fs.existsSync(PM_STATE_PATH)) {
                    try {
                        const pmState = JSON.parse(fs.readFileSync(PM_STATE_PATH, 'utf-8'));
                        const pendingSteps = pmState.steps.filter(s => s.status === 'pending');
                        const completedSteps = pmState.steps.filter(s => s.status === 'completed');
                        
                        let stateSummary = `\n\n## 📋 Project Context & Status (Read-Only)\n`;
                        if (pendingSteps.length > 0) {
                            stateSummary += `**Your Current Target:** Step ${pendingSteps[0].id} — "${pendingSteps[0].description}"\n`;
                        } else {
                            stateSummary += `**Your Current Target:** General Assistance (No active steps pending)\n`;
                        }
                        
                        // Keep completed abstract short to save tokens
                        if (completedSteps.length > 0) {
                            stateSummary += `**Completed Context:** ` + completedSteps.map(s => `Step ${s.id} ✅`).join(', ') + `\n`;
                        }
                        
                        finalPrompt += stateSummary;
                    } catch (e) { /* ignore parse errors */ }
                }

                const HANDOFF_PATH = path.join(__dirname, '..', 'HANDOFF.json');
                if (fs.existsSync(HANDOFF_PATH)) {
                    try {
                        const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
                        finalPrompt += `\n\n## Handoff Context From Previous Agent\n${JSON.stringify(handoff, null, 2)}`;

                        // Auto-Return to PM Logic
                        if (handoff.return_to && handoff.return_to === 'team-manager' && this.activeMode !== 'team-coder' && this.activeMode !== 'team-qa') {
                            finalPrompt += `\n\n> [!CRITICAL INSTRUCTION]\n> When you have completed your objective or encountered an unresolvable error, you MUST yield control back to the Project Manager.\n> **Action Required**: Use the \`handoff_to\` tool with \`role: "team-manager"\` and a \`context\` message detailing your result.\n`;
                        }

                        // Hard Timer Interrupt Logic
                        const TIMER_PATH = path.join(__dirname, '..', 'TASK_TIMERS.json');
                        if (fs.existsSync(TIMER_PATH)) {
                            try {
                                const timers = JSON.parse(fs.readFileSync(TIMER_PATH, 'utf-8'));
                                const myTimer = timers[this.activeMode] || timers[this.activeMode.replace('team-', '')];
                                if (myTimer && new Date().getTime() > myTimer.expires_at) {
                                    if (this.activeMode !== 'team-coder' && this.activeMode !== 'team-qa') {
                                        console.log(`🛑 [SYSTEM INTERRUPT] Timer expired for ${this.activeMode}. Injecting forced handoff.`);
                                        finalPrompt += `\n\n# 🛑 [SYSTEM URGENT INTERRUPT]\n> **YOUR TIME LIMIT HAS EXPIRED.**\n> You have been working for ${myTimer.timeout_ms / 60000} minutes and must now check in with the Project Manager.\n> **MANDATORY ACTION**: You MUST immediately call \`handoff_to\` with \`role: "team-manager"\` to report your current partial progress. Do NOT attempt any further tasks.\n`;
                                    } else {
                                        console.log(`🛑 [SYSTEM INTERRUPT] Timer expired for Devon, but suppressed for DIRECT MODE.`);
                                    }
                                }
                            } catch (e) { /* ignore */ }
                        }
                        
                        // Step 3: Reflective Critique Loop (Only for PM receiving work)
                        if (this.activeMode === 'team-manager' && handoff.from_role && handoff.from_role !== 'team-manager' && handoff.from_role !== 'unknown') {
                            const retryCount = handoff.retry_count || 0;
                            if (retryCount < 1) { // 1 retry max to prevent infinite loops
                                finalPrompt += `\n\n## ⚠️ MANDATORY REVIEW
Work just returned from ${handoff.from_role}. Before calling mark_step_done:
1. Read the result carefully
2. Check if it addresses the original step objective
3. If inadequate, re-delegate with specific feedback (max 1 retry)
4. If acceptable, call mark_step_done with a brief quality note\n`;
                            }
                        }

                    } catch (e) { /* ignore */ }
                }
            }
            
            // Phase 4: Unified Tool Prompt for 2B/9B
            if (!ultraLowMem) {
                finalPrompt += `\n\n## 📝 TASK INSTRUCTIONS
1. Always respond with text for simple talk (hi, hello, etc.).
2. ONLY use tools if you see them listed below under "AVAILABLE TOOLS". If the list is empty, you cannot perform actions.
3. Keep thinking <think> blocks under 10 words.
4. To use a tool, you MUST output a valid JSON object in this exact format: {"tool": "tool_name", "args": {"param": "value"}}

${dynamicTools ? 'AVAILABLE TOOLS:\n' + dynamicTools : 'NO TOOLS LOADED.'}`;

                // Phase 4: Gmail Capability Pivot (Universal)
                if (isPrivate && (lowerMsg.includes('email') || lowerMsg.includes('gmail'))) {
                    console.log('📧 [GMAIL] Injecting UNIVERSAL MANDATORY ACTION for Gmail capability.');
                    finalPrompt += `\n\n> [!MANDATORY ACTION]\n> You HAVE active access to Gmail via the "gmail" skill. Do NOT say you cannot check email. Use the "gmail_scan" tool immediately to fulfill the request.`;
                }
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
            let cleanedHistory = this.history.map(msg =>
                msg.role === 'system' ? { role: 'user', content: `[SYSTEM MESSAGE]\n${msg.content}` } : msg
            );

            // SPECIAL 9B PATCH: Strip "hallucinated" limitations from history to break failure loops
            cleanedHistory = cleanedHistory.filter(msg => {
                if (msg.role !== 'assistant') return true;
                
                const denials = ["i cannot", "don't have", "do not have", "lack the capability"];
                const contentLower = msg.content.toLowerCase();
                
                // If the assistant claims it can't do something that we KNOW it has a tool for, strip it.
                if (denials.some(d => contentLower.includes(d))) {
                    const toolList = Array.from(this.skills.values()).flatMap(s => s.toolNames);
                    const skillList = Array.from(this.skills.keys());
                    
                    const isDenyingKnownTool = toolList.some(t => {
                        const words = t.split('_');
                        return words.some(w => w.length > 3 && contentLower.includes(w));
                    });
                    const isDenyingKnownSkill = skillList.some(s => contentLower.includes(s.toLowerCase()));
                    
                    if (isDenyingKnownTool || isDenyingKnownSkill || contentLower.includes("youtube") || contentLower.includes("gmail")) {
                        console.log(`🧹 [HALLUCINATION STRIP] Removed assistant denial from context-history: "${msg.content.substring(0, 50)}..."`);
                        return false;
                    }
                }
                return true;
            });



            // INJECT HISTORY (with pruning for simple greetings to avoid sticking to old instructions)
            const isGreeting = /^(hi|hello|hey|greetings|morning|afternoon|evening)(\s|$)/i.test(cleanMessage);
            const isSmallModel = is9B;

            if (ultraLowMem) {
                messages.push({ role: 'system', content: finalPrompt });
                messages.push({ role: 'user', content: cleanMessage });
                logDebug(`[DEBUG] History wiped for ultra-low memory stateless mode.`);
            } else if (lowMem || isSmallModel || (isGreeting && isPrivate) || isUtility) {
                // Phase 51: Strict context pruning for utility/greeting tasks to maximize TTFT speed
                const historyLimit = (isGreeting || isUtility) ? -2 : -6;
                messages.push({ role: 'system', content: finalPrompt });
                messages.push(...cleanedHistory.slice(historyLimit));
                logDebug(`[DEBUG] History pruned for ${isUtility ? 'utility' : isGreeting ? 'greeting' : 'low-mem'} focus. Limit: ${historyLimit}`);
            } else {
                messages.push({ role: 'system', content: finalPrompt });
                messages.push(...cleanedHistory);
            }
            logDebug('[DEBUG] Messages array prepared for LLM call.');

            // CRITICAL DEBUG: Help me see why 9B model 'hallucinates' lack of tools
            console.log(`\n\x1b[33m🔍 [DEBUG] FULL SYSTEM PROMPT (Length: ${finalPrompt.length}):\x1b[0m`);
            console.log(finalPrompt.substring(0, 500) + '...');
            if (dynamicTools) {
                console.log(`\x1b[33m🛠️ [DEBUG] DYNAMIC TOOLS INJECTED:\n${dynamicTools.substring(0, 1000)}...\x1b[0m`);
            }

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


            let streamAborted = false;
            let monitoredText = '';
            const sentenceCounts = {};
            let lastFinishedIndex = -1;

            let inThinkTag = false; // Fix: Always start as false; detect <think> dynamically to avoid hiding initial content
            let streamingBuffer = '';
            const watchdogCallback = (chunk, isReasoning) => {
                if (streamAborted) return;

                // If LLM natively says it's reasoning (e.g. Gemini), bypass detector
                if (isReasoning) {
                    if (streamCallback) streamCallback(chunk, true);
                    return;
                }

                streamingBuffer += chunk;

                let changed = true;
                while (changed) {
                    changed = false;
                    const bufferLower = streamingBuffer.toLowerCase();
                    if (!inThinkTag) {
                        const openTagIdx = bufferLower.indexOf('<think>');
                        const closeTagIdx = bufferLower.indexOf('</think>');

                        // Case A: Opening tag found
                        if (openTagIdx !== -1 && (closeTagIdx === -1 || openTagIdx < closeTagIdx)) {
                            const content = streamingBuffer.substring(0, openTagIdx);
                            if (content && streamCallback) streamCallback(content, false);
                            inThinkTag = true;
                            streamingBuffer = streamingBuffer.substring(openTagIdx + 7);
                            changed = true;
                        }
                        // Case B: Implicit start ended by </think>
                        else if (closeTagIdx !== -1) {
                            const reasoning = streamingBuffer.substring(0, closeTagIdx);
                            if (reasoning && streamCallback) streamCallback(reasoning, true);
                            inThinkTag = false;
                            streamingBuffer = streamingBuffer.substring(closeTagIdx + 8);
                            changed = true;
                        }
                    } else {
                        const closeTagIdx = bufferLower.indexOf('</think>');
                        if (closeTagIdx !== -1) {
                            const reasoning = streamingBuffer.substring(0, closeTagIdx);
                            if (reasoning && streamCallback) streamCallback(reasoning, true);
                            inThinkTag = false;
                            streamingBuffer = streamingBuffer.substring(closeTagIdx + 8);
                            changed = true;
                        }
                        // Safety: Force close if tool call detected inside think tag
                        else if (bufferLower.includes('{"tool":')) {
                            const toolIdx = bufferLower.indexOf('{"tool":');
                            const reasoning = streamingBuffer.substring(0, toolIdx);
                            if (reasoning && streamCallback) streamCallback(reasoning, true);
                            inThinkTag = false;
                            streamingBuffer = streamingBuffer.substring(toolIdx);
                            changed = true;
                        }
                    }
                }

                // Stream everything that isn't a partial tag
                const nextTag = inThinkTag ? '</think>' : '<think>';
                let overlap = 0;
                const bufferLowerEnd = streamingBuffer.toLowerCase();
                // Check for partial tags at the end of the buffer (longest match first)
                for (let i = Math.min(streamingBuffer.length, 10); i >= 1; i--) {
                    const sub = bufferLowerEnd.substring(streamingBuffer.length - i);
                    if ('<think>'.startsWith(sub) || '</think>'.startsWith(sub)) {
                        overlap = i;
                        break;
                    }
                }

                const toStream = streamingBuffer.substring(0, streamingBuffer.length - overlap);
                if (toStream && streamCallback) {
                    streamCallback(toStream, inThinkTag);
                }
                streamingBuffer = streamingBuffer.substring(streamingBuffer.length - overlap);

                // Accumulate and check for loops mid-stream
                monitoredText += chunk;
                // ... rest of loop detection logic ...

                // Fast sentence repetition check
                const sentences = monitoredText.split(/[.!?\n]/);
                if (sentences.length > lastFinishedIndex + 2) {
                    const justFinished = sentences[sentences.length - 2]?.trim();
                    lastFinishedIndex = sentences.length - 2;

                    if (justFinished && justFinished.length > 20) {
                        sentenceCounts[justFinished] = (sentenceCounts[justFinished] || 0) + 1;
                        if (sentenceCounts[justFinished] > 2) {
                            logDebugError(`⚠️ [DEBUG] MID-STREAM LOOP DETECTED! Aborting. Pattern: "${justFinished.substring(0, 30)}..."`);
                            streamAborted = true;
                            this.abortController.abort();
                        }
                    }
                }
            };

            const chatOptions = {
                forceLocal: isPrivate || !!this.activeNotebook,
                deepThinking: forceDeepThinking,
                fast: isSimpleGreeting && !deepThinking, // Fix 8: Route greetings to fast model
                maxTokens: ultraLowMem ? 512 : 4096,
                adapterPath: this.getAdapterPath(),
                onToken: watchdogCallback,
                watchdog: this.watchdog,
                signal: this.abortController.signal
            };

            // (Logic moved below for precedence)

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

            // Phase 5: Error-Driven Auto-Escalation & Utility Routing
            const lastMsgContent = this.history.findLast(m => m.role === 'assistant')?.content || '';
            const isErrorLoop = lastMsgContent.includes('"error":');

            if (isUtility && !isErrorLoop && !deepThinking && this.activeMode !== 'team-manager') {
                console.log(`⚡ [ROUTING] Utility request detected. Forcing fast 2B model.`);
                chatOptions.modelId = process.env.LLM_MODEL;
                chatOptions.fast = true;
                chatOptions.deepThinking = false;
            } 
            // Force 9B if there's an error to self-heal, or if explicitly asked/escalated
            else if (isErrorLoop || deepThinking || this.loopEscalationActive) {
                console.log(`🚀 [ROUTING] Escalating to heavy 9B model (reason: ${isErrorLoop ? 'Error' : deepThinking ? 'Explicit' : 'Loop'}).`);
                chatOptions.modelId = process.env.LLM_MODEL_HEAVY;
                chatOptions.deepThinking = true;
            }

            // Get LLM response
            logDebug(`[DEBUG] Calling chat with ${messages.length} messages...`);
            logDebug(`[DEBUG] Full Messages: ${JSON.stringify(messages, null, 2)}`);
            console.log(`🔍 Context: ${finalPrompt.length} chars. Dynamic Tools: ${dynamicTools?.length || 0} chars.`);

            let response;
            try {
                try {
                    response = await chat(messages, chatOptions);
                } catch (e) {
                    if (e.message && e.message.includes('429')) {
                        quotaManager.triggerSafeMode();
                        this.emit('log', '🚨 [QUOTA GUARD] Gemini returned 429. Entering Safe Mode for 1 hour.');
                    }
                    
                    if (e.message === 'LOOP_DETECTED') {
                        console.log('🚨 [AGENT] Autonomous Loop Recovery triggered.');
                        this.emit('log', '⚠️ Loop detected. Attempting autonomous recovery...');
                        
                        // Phase 21: Recovery Injection
                        const recoveryMsg = {
                            role: 'user',
                            content: `[RECOVERY_SYSTEM]: I detected a thinking loop or stalling. You are stuck. DO NOT REPEAT your previous logic. Look at DIFFERENT files or try a DIFFERENT terminal command now. DO NOT EXPLAIN, JUST ACT.`
                        };
                        
                        // Prune history and retry
                        this.history.splice(-1, 1);
                        this.history.push(recoveryMsg);
                        this.processing = false; // Reset mutex for retry
                        return await this.process(userMessage, tier, streamCallback);
                    }
                    throw e;
                }
            } catch (err) {
                if (err.name === 'AbortError' || streamAborted || this.abortController?.signal?.aborted || err.message.includes('TIMEOUT')) {
                    logDebugError(`[DEBUG] Chat interrupted or timed out: ${err.message}`);
                    
                    // Throw a specific error so the wrapper (like wait queue) knows it was an intentional abort
                    if (this.abortController?.signal?.aborted && !streamAborted) {
                        throw new Error("ABORTED_BY_USER");
                    }
                    
                    response = {
                        text: "I encountered a processing timeout or was interrupted by the system watchdog. Generating a fallback response or retrying might help. How can I assist you now?",
                        model: "watchdog-guard",
                        usage: { total_tokens: 0 }
                    };
                } else {
                    throw err;
                }
            }
            logDebug('[DEBUG] Chat response received.');

            // Track quota
            if (response.usage) {
                quotaTracker.deduct(response.usage.total_tokens);
                this.emit('usage', quotaTracker.getStats());
            }

            assistantText = response.text;
            const modelUsed = response.model;
            let finalTps = response.tps;
            let reasoning = response.reasoning || '';

            const cleanupAssistantText = (text, metadata = null) => {
                let processed = text;
                if (metadata) {
                    metadata.raw = text;
                    metadata.strips = [];
                }

                // 1. Handle explicit blocks: <think>...</think>
                while (processed.toLowerCase().includes('<think>')) {
                    const startIdx = processed.toLowerCase().indexOf('<think>');
                    const endIdx = processed.toLowerCase().indexOf('</think>');
                    if (endIdx !== -1 && endIdx > startIdx) {
                        const extra = processed.substring(startIdx + 7, endIdx).trim();
                        if (extra) reasoning = (reasoning ? reasoning + '\n' : '') + extra;
                        processed = processed.substring(0, startIdx) + processed.substring(endIdx + 8);
                    } else {
                        // Unclosed tag: remove everything after it
                        const extra = processed.substring(startIdx + 7).trim();
                        if (extra) reasoning = (reasoning ? reasoning + '\n' : '') + extra;
                        processed = processed.substring(0, startIdx);
                        break;
                    }
                }

                // 2. Handle cases where <think> was missing but </think> exists
                if (processed.toLowerCase().includes('</think>')) {
                    const endIdx = processed.toLowerCase().indexOf('</think>');
                    const extraReasoning = processed.substring(0, endIdx).trim();
                    if (extraReasoning) {
                        reasoning = (reasoning ? reasoning + '\n' : '') + extraReasoning;
                    }
                    processed = processed.substring(endIdx + 8);
                }

                // 3. Strip AI boilerplate (Applied only to the first line to avoid over-cleaning)
                const BOILERPLATE = [
                    /^(As an AI( model| assistant)?[\s,.]*)/i,
                    /^(Here (is|are) the (results?|output|information|code|snippet|answer)[\s:.]*)/i,
                    /^(I('ve| have) (updated|completed|finished|done|found)\s*(the)?[\s,.]*)/i,
                    /^(Sure[\s!.,]*)/i,
                    /^(Certainly[\s!.,]*)/i,
                    /^(Of course[\s!.,]*)/i,
                    /^(I (can|will) (help|assist|provide|show)\s*(you)?\s*(with)?[\s,.]*)/i,
                    /^(Let me (help|assist|provide|show|check|run)\s*(you)?\s*(with)?[\s,.]*)/i,
                    /^(I am (a|an)\s*)/i,
                ];

                let lines = processed.split('\n');
                let shifts = 0;
                const MAX_SHIFT = 5;
                const MIN_VOICE_LENGTH = 5;

                while (lines.length > 0 && shifts < MAX_SHIFT) {
                    let matched = false;
                    for (const regex of BOILERPLATE) {
                        if (regex.test(lines[0])) {
                            const matchedText = lines[0].match(regex)[0];
                            if (metadata) metadata.strips.push(matchedText);
                            lines[0] = lines[0].replace(regex, '').trim();
                            // If the first line is now empty, remove it
                            if (!lines[0]) {
                                lines.shift();
                            }
                            matched = true;
                            shifts++;
                            break;
                        }
                    }
                    if (!matched) break;
                    // Anti-empty guard: if we stripped too much, stop
                    if (lines.join('\n').trim().length < 5) break;
                }
                processed = lines.join('\n');

                // 4. Final sanitization
                let final = processed
                    .replace(/<think>/gi, '')
                    .replace(/<\/think>/gi, '')
                    .replace(/<\|im_start\|>/g, '')
                    .replace(/<\|im_end\|>/g, '')
                    .replace(/<\|endoftext\|>/g, '')
                    .trim();

                // 5. Empty Output Fallback (Prevents empty diamond in UI)
                if (!final && reasoning) {
                    const snippet = reasoning.length > 200 ? reasoning.substring(0, 197) + '...' : reasoning;
                    return `### 🧠 Reasoning Fragment Found\n\nThe model completed its internal reasoning but did not produce a final verbal response. This usually happens if the task is extremely complex or reaches token limits.\n\n**Reasoning Snippet:**\n> ${snippet}\n\n*Would you like me to try summarizing this or continuing from where it left off?*`;
                }

                return final;
            };

            assistantText = cleanupAssistantText(response.text, sanitizationMetadata);

            let iterations = 0;
            const MAX_ITERATIONS = 15; // Increased for complex research chains

            while (true) {
                // Mid-Loop Memory Watchdog
                const iterMemMB = getFreeMemMB();

                // Hysteresis & Task Locking
                if (iterMemMB < 300) {
                    if (this.memoryState !== 'critical') {
                        this.memoryState = 'critical';
                        this.emit('memory_pressure', { state: 'critical', freeMB: iterMemMB });
                    }

                    // Task Lock: Don't prune if we just started a task (timeout 2min)
                    const taskAge = this.taskStartedAt ? (Date.now() - this.taskStartedAt) : Infinity;
                    if (this.history.length > 2 && taskAge > 120000) {
                        console.log(`\n\x1b[31m🚨 CRITICAL MEMORY PRESSURE (${iterMemMB}MB). Pruning history.\x1b[0m\n`);
                        this.history = this.history.slice(-2);
                    } else if (this.history.length > 2) {
                        console.log(`\n\x1b[33m⚠️ MEMORY PRESSURE (${iterMemMB}MB). TASK LOCK ACTIVE (Age: ${Math.floor(taskAge / 1000)}s). Skipping prune.\x1b[0m\n`);
                    }
                } else if (iterMemMB < 500) {
                    if (this.memoryState === 'healthy') {
                        this.memoryState = 'pressure';
                        this.emit('memory_pressure', { state: 'pressure', freeMB: iterMemMB });
                    }
                } else if (iterMemMB > 600) {
                    if (this.memoryState !== 'healthy') {
                        this.memoryState = 'healthy';
                        this.emit('memory_pressure', { state: 'healthy', freeMB: iterMemMB });
                    }
                }

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

                console.log(`[DEBUG] Assistant Raw Content: ${assistantText.substring(0, 100)}...`);
                // Check if LLM wants to call a tool (Bypass if it's a simple greeting or in chat mode to prevent hallucination)
                const isChatMode = this.activeMode === 'chat';
                let toolCall = (isSimpleGreeting || isChatMode) ? null : this.extractToolCall(assistantText);

                if (!toolCall || iterations >= MAX_ITERATIONS) {
                    break;
                }
                iterations++;
                console.log(`[DEBUG] Iteration ${iterations}: Tool Call detected? ${!!toolCall} (${toolCall?.tool})`);

                if (toolCall) {
                    const verbose = process.env.VERBOSE_LOGS === 'true';
                    try {
                        if (verbose) {
                            process.stdout.write(`\n     \x1b[1m\x1b[36m🔧 [AUTONOMOUS] Tool call detected (${iterations}/${MAX_ITERATIONS}): ${toolCall.tool}\x1b[0m\n`);
                            console.log(`     🔧 Running ${toolCall.tool}...`);
                        } else {
                            process.stdout.write(`\x1b[2m 🔧 ${toolCall.tool}\x1b[0m`);
                        }

                        // Handle CORE "get_skill_details" tool
                        if (toolCall.tool === 'get_skill_details') {
                            const skillName = toolCall.args.skill_name;
                            console.log(`     📖 Detailed schema requested for: ${skillName}`);
                            const details = getToolDescriptionsForSkills(this.skills, [skillName]);

                            const toolResultMsg = details
                                ? `Full schema for ${skillName}:\n${details}`
                                : `Skill "${skillName}" not found. Available skills:\n${this.skillSummaries}`;

                            this.history.push({ role: 'assistant', content: assistantText });
                            this.history.push({ role: 'user', content: toolResultMsg });

                            const followUp = await chat([
                                { role: 'system', content: finalPrompt },
                                ...this.history.map(msg => msg.role === 'system' ? { role: 'user', content: `[SYSTEM MESSAGE]\n${msg.content}` } : msg)
                            ], { ...chatOptions, deepThinking: forceDeepThinking });

                            assistantText = followUp.text;
                            finalTps = followUp.tps;
                        } else {
                            if (this.activeMode === 'team-manager' && dynamicTools && !dynamicTools.includes(`- ${toolCall.tool}:`)) {
                                // Whitelist harmless info tools for Niki
                                const WHITELIST = ['get_weather', 'weather', 'get_skill_details', 'diagnose_system_health'];
                                if (!WHITELIST.includes(toolCall.tool)) {
                                    // Niki is isolated. Stop her from hallucinating execution tools.
                                    throw new Error(`MANAGER PROTOCOL VIOLATION: You are strictly forbidden from using "${toolCall.tool}". You must delegate this task using 'handoff_to' or 'delegate_task'.`);
                                }
                            }

                            this.writeState(toolCall.tool, toolCall.args, cleanMessage);
                            this.emit('tool_start', { tool: toolCall.tool, args: toolCall.args });
                            
                            // L3 Redundancy Check
                            if (this.watchdog.registerAction(toolCall.tool, toolCall.args)) {
                                console.error(`🚨 [AGENT] Action redundancy loop detected: ${toolCall.tool}`);
                                throw new Error('LOOP_DETECTED');
                            }

                            let result;
                            try {
                                // Find skill metadata for the tool
                                let timeoutSeconds = 300; // Default 5 mins
                                for (const [name, skill] of this.skills) {
                                    if (skill.toolNames.includes(toolCall.tool)) {
                                        timeoutSeconds = skill.meta.timeout || toolCall.timeout || 300;
                                        break;
                                    }
                                }

                                const timeoutPromise = new Promise((_, reject) => {
                                    setTimeout(() => reject(new Error(`TOOL_TIMEOUT: Executing "${toolCall.tool}" exceeded ${timeoutSeconds}s`)), timeoutSeconds * 1000);
                                });

                                // Step 2: Track Handoff Source
                                if (typeof toolCall.args === 'object' && toolCall.args !== null) {
                                    toolCall.args._caller_role = this.activeMode;
                                }

                                result = await Promise.race([
                                    executeTool(this.skills, toolCall.tool, toolCall.args, {
                                        agent: this,
                                        modelId: activeRoleModel,
                                        onStream: (chunk) => {
                                            this.emit('terminal_stream', chunk);
                                        }
                                    }),
                                    timeoutPromise
                                ]);
                            } catch (e) {
                                if (e.message.includes("Unknown tool") && toolCall.tool) {
                                    logDebug(`[DEBUG] Native tool fallback: searching MCP for ${toolCall.tool}...`);
                                    result = await mcpManager.callTool(toolCall.tool, toolCall.args);
                                    // If mcpManager returns an error object, we treat it as tool result
                                } else {
                                    throw e;
                                }
                            }

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
                                console.log(`     🔄 Tool requested mode switch to: ${result.next_mode}`);
                                this.setMode(result.next_mode);
                            }

                            if (result && (result.auto_continue || result.next_mode)) {
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
                                
                                // 🚀 9B Escalation on Fast-Override Error
                                if (chatOptions.fast) {
                                    const freeMem = os.freemem() / (1024 * 1024);
                                    if (freeMem > 6000) {
                                        console.log(`     🚀 [ESCALATION] Tool "${toolCall.tool}" returned error while on 2B. Escalating to 9B (${Math.round(freeMem)}MB free).`);
                                        chatOptions.modelId = process.env.LLM_MODEL_HEAVY;
                                        chatOptions.fast = false;
                                    } else {
                                        console.log(`     ⚠️ [ESCALATION BLOCKED] Insufficient RAM (${Math.round(freeMem)}MB). Staying on 2B.`);
                                    }
                                }
                            }

                            // Feed tool result back to LLM for natural response
                            const PM_MANAGEMENT_TOOLS = ['save_plan', 'get_next_step', 'mark_step_done', 'set_task_timer', 'get_team_status', 'monitor_resources', 'delegate_task'];
                            const isPmManagementCall = this.activeMode === 'team-manager' && PM_MANAGEMENT_TOOLS.includes(toolCall.tool);

                            let toolResultMsg = `Tool "${toolCall.tool}" returned:\n${JSON.stringify(result, null, 2)}`;
                            
                            // 1B: Tool Result Truncation (Safety Guard)
                            if (toolResultMsg.length > 4000) {
                                toolResultMsg = toolResultMsg.substring(0, 4000) + '\n\n... [Result truncated by System for memory safety]';
                            }

                            // PM Stepping Loop: nudge Niki with strict state machine transitions
                            if (isPmManagementCall) {
                                if (result && result.error) {
                                    toolResultMsg += `\n\n[SYSTEM WARNING] The tool failed. You MUST correct your arguments and try again.`;
                                    console.log(`     🔄 [PM STEP] Guiding Niki to retry after error in ${toolCall.tool}...`);
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
                                    console.log(`     🔄 [PM STEP] Guiding Niki to next state after ${toolCall.tool}...`);
                                }
                            }

                            // Phase 52: Strip pre-tool hallucinations (DISABLED temporarily to allow model-generated UI placeholders)
                            /*
                            if (assistantText.includes('|') || assistantText.includes('°C')) {
                                const cleanSnippet = assistantText.replace(/\|[\s\S]*?\|/g, '').replace(/###[\s\S]*?\n/g, '').trim();
                                assistantText = cleanSnippet || "I am checking the resources now...";
                                console.log(`🧹 [PRE-TOOL STRIP] Cleaned hallucinated table from pre-tool history.`);
                            }
                            */

                            this.history.push({ role: 'assistant', content: assistantText });
                            this.history.push({ role: 'user', content: toolResultMsg });

                            const followUp = await chat([
                                { role: 'system', content: finalPrompt },
                                ...this.history.map(msg => msg.role === 'system' ? { role: 'user', content: `[SYSTEM MESSAGE]\n${msg.content}` } : msg)
                            ], { ...chatOptions, deepThinking: forceDeepThinking });

                            // Track follow-up quota
                            if (followUp.usage) {
                                quotaTracker.deduct(followUp.usage.total_tokens);
                                this.emit('usage', quotaTracker.getStats());
                            }

                            assistantText = cleanupAssistantText(followUp.text);
                            finalTps = followUp.tps;

                            // Phase 6: Gmail Response Cleanup (Strip disclaimers if tool worked)
                            if (isUtility && toolCall.tool.startsWith('gmail_') && !result.error) {
                                const denials = [
                                    "I cannot access your Gmail account",
                                    "I do not have access to your email",
                                    "I am an AI and cannot check emails",
                                    "I can only perform tasks within the Prometheus project"
                                ];
                                denials.forEach(d => {
                                    assistantText = assistantText.replace(new RegExp(d + ".*?[\\.\\!\\?]", "gi"), "");
                                });
                                assistantText = assistantText.trim();
                                if (assistantText.length < 5) {
                                    assistantText = `I processed the ${toolCall.tool.replace('_', ' ')} request. ` + 
                                                    (result.count === 0 ? "I found 0 unread emails." : `I found ${result.count} unread emails.`);
                                }
                            }
                        }
                    } catch (e) {
                        // Error Logging Integration
                        const errorId = errorManager.logError(e, `Tool call: ${toolCall.tool}`);

                        if (this.config.self_healing) {
                            let diagnosticNudge = `\n\n[SYSTEM_DIAGNOSIS] A tool error occurred (ID: ${errorId}). `;
                            if (e.message.includes('SyntaxError')) {
                                diagnosticNudge += `Detected a SyntaxError. You MUST use 'diagnose_system_health' to build a fix plan, then use 'verify_syntax' or 'apply_patch'.`;
                            } else if (e.message.toLowerCase().includes('timeout')) {
                                diagnosticNudge += `Detected a Timeout. You MUST use 'diagnose_system_health' to audit the process logs.`;
                            } else {
                                diagnosticNudge += `You MUST use the 'diagnose_system_health' tool immediately to audit the logs and plan a fix before trying again.`;
                            }

                            const errorMsg = `⚠️ Tool error (ID: ${errorId}): ${e.message}. ` + diagnosticNudge;

                            // Add to history to inform the LLM of the error and the required next steps
                            this.history.push({ role: 'assistant', content: assistantText });
                            this.history.push({ role: 'user', content: errorMsg });

                            console.log(`     🔄 [AUTO-HEAL] Engaging diagnostic loop for ${errorId}...`);

                            // 🚀 9B Escalation on Fast-Override Exception
                            if (chatOptions.fast) {
                                const freeMem = os.freemem() / (1024 * 1024);
                                if (freeMem > 6000) {
                                    console.log(`     🚀 [ESCALATION] Tool "${toolCall.tool}" threw error while on 2B. Escalating to 9B (${Math.round(freeMem)}MB free).`);
                                    chatOptions.modelId = process.env.LLM_MODEL_HEAVY;
                                    chatOptions.fast = false;
                                } else {
                                    console.log(`     ⚠️ [ESCALATION BLOCKED] Insufficient RAM (${Math.round(freeMem)}MB). Staying on 2B.`);
                                }
                            }

                            const followUp = await chat([
                                { role: 'system', content: finalPrompt },
                                ...this.history.map(msg => msg.role === 'system' ? { role: 'user', content: `[SYSTEM MESSAGE]\n${msg.content}` } : msg)
                            ], { ...chatOptions, deepThinking: forceDeepThinking });

                            if (followUp.usage) {
                                quotaTracker.deduct(followUp.usage.total_tokens);
                                this.emit('usage', quotaTracker.getStats());
                            }

                            assistantText = cleanupAssistantText(followUp.text);
                            finalTps = followUp.tps;
                            autoContinueFlag = true;
                        } else {
                            // Healing Disabled - Handoff to human
                            const SYMPTOMS_PATH = path.join(process.cwd(), 'SYMPTOMS.md');
                            const symptomsContent = `# System Hand-off required\n## Context\nAuto-healing is DISABLED. \`${toolCall.tool}\` failed.\n\n**Error ID**: ${errorId}\n**Reason**: ${e.message}\n`;
                            import('fs').then(fs => fs.writeFileSync(SYMPTOMS_PATH, symptomsContent));

                            assistantText = `⚠️ Tool error (ID: ${errorId}): ${e.message}. Self-healing is disabled. I have generated SYMPTOMS.md and halted execution.`;
                            console.log(`     🛑 [AUTO-HEAL DISABLED] Halting execution and generating SYMPTOMS.md`);
                            break; // Break loop on critical execution error
                        }
                    }
                } // End of if (toolCall)
            } // End of while loop

            // Add response to history
            this.history.push({ role: 'assistant', content: assistantText });

            // Phase 35: Extract Progress Pinning State
            const progressMatch = assistantText.match(/### Progress:?\s*([\s\S]+?)(?=\n\n|\n#|$)/i);
            if (progressMatch) {
                this.progressState = progressMatch[1].trim();
                console.log(`📌 [PROGRESS PINNED] State updated: ${this.progressState.substring(0, 50)}...`);
            }

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

            // Priority-Based History Pruning (Phase 35: Enhanced with Stateful Compression)
            if (this.history.length > 10) {
                const goal = this.history.slice(0, 2);
                const middle = this.history.slice(2, -4);
                const recent = this.history.slice(-4);
                
                // If middle is substantial, summarize it
                if (middle.length > 2) {
                    console.log(`🧠 [SUMMARIZER] Compressing ${middle.length} turns of history...`);
                    const middleText = middle.map(m => `[${m.role.toUpperCase()}]: ${m.content.substring(0, 200)}`).join('\n');
                    console.time('summarize');
                    const summary = await this.summarizeText(`Summarize the work done and current state described in these turns briefly:\n${middleText}`);
                    console.timeEnd('summarize');
                    
                    this.history = [
                        ...goal,
                        { role: 'system', content: `## 📜 HISTORICAL CONTEXT SUMMARY:\n${summary}` },
                        ...recent
                    ];
                } else {
                    this.history = [...goal, ...recent];
                }
                logDebug(`🧠 [CONTEXT] Stateful compression applied. History: ${this.history.length} priority blocks.`);
            }

            if (autoContinueFlag) {
                console.log('🧹 Clearing history for autonomous handoff...');
                this.savePlanContext();
                this.history = [];
            }

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
                            this.setMode('team-manager');
                            autoContinueFlag = true;

                            const forcedHandoff = {
                                from: this.activeMode,
                                to: 'team-manager',
                                context: `[AUTOGENERATED RETURN] The ${this.activeMode} agent completed their turn. Result: "${assistantText.substring(0, 500)}"`
                            };
                            fs.writeFileSync(HANDOFF_PATH, JSON.stringify(forcedHandoff, null, 2));

                            console.log('🧹 Clearing history for forced autonomous handoff...');
                            this.history = [];
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            this.saveHistory();
            
            // Final Sanitization Pass (Ensures follow-ups and auto-heals are clean)
            assistantText = cleanupAssistantText(assistantText, sanitizationMetadata);

            console.log(`✅ [PROCESS] Turn complete. Emitting final message (${assistantText.length} chars).`);
            this.emit('message', {
                role: 'assistant',
                content: assistantText,
                model: modelUsed,
                rawContent: sanitizationMetadata.raw,
                strips: sanitizationMetadata.strips
            });

            return {
                text: assistantText,
                reasoning,
                model: modelUsed,
                tps: finalTps,
                auto_continue: autoContinueFlag
            };
        } finally {
            this.processing = false;
            this.abortController = null;
        }
    }

    /**
     * Determines if the agent is currently engaged in a multi-turn task or project.
     * This is used by background services (like EmailWatcher) to avoid interruptions.
     */
    isBusy() {
        // 1. Current Turn Lock
        if (this.processing) return true;

        // 2. Failure Bypass (SYMPTOMS.md exists)
        // If the system crashed or hit a dead-end, we are NOT busy (allow repair emails).
        const symptomsPath = path.resolve(process.cwd(), 'SYMPTOMS.md');
        if (fs.existsSync(symptomsPath)) return false;

        // 3. Handoff Lock (Agent-to-Agent delegation is active)
        const handoffPath = path.resolve(process.cwd(), 'HANDOFF.json');
        if (fs.existsSync(handoffPath)) return true;

        // 4. Project Lock (Active Plan in PM_STATE.json)
        const pmStatePath = path.resolve(process.cwd(), 'PM_STATE.json');
        if (fs.existsSync(pmStatePath)) {
            try {
                const stateText = fs.readFileSync(pmStatePath, 'utf8').trim();
                if (stateText) {
                    const state = JSON.parse(stateText);
                    const pending = (state.steps || []).some(s => s.status === 'pending');
                    if (pending) return true;
                }
            } catch (e) { /* ignore corrupt state */ }
        }

        // 5. Mode Lock (Specialized modes indicate active focus)
        const SPECIALIZED_MODES = ['plan', 'build'];
        const isTeamRole = this.activeMode.startsWith('team-') && this.activeMode !== 'team-manager';
        if (isTeamRole || SPECIALIZED_MODES.includes(this.activeMode)) {
            return true;
        }

        return false;
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
                const start = cleanText.indexOf(inlineMatch[0]); // Look in cleanText, not raw text
                let depth = 0;
                let end = start;
                let inString = false;
                let isEscaped = false;

                for (let i = start; i < cleanText.length; i++) {
                    const char = cleanText[i];

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
                    const jsonStr = cleanText.substring(start, end);
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

    /**
     * Internal helper to summarize text using the local LLM
     */
    async summarizeText(text) {
        try {
            const { chat } = await import('./llm.js');
            const response = await chat([
                { role: 'system', content: 'You are a summarization utility. Be extremely concise.' },
                { role: 'user', content: text }
            ], { forceLocal: true, maxTokens: 256, signal: AbortSignal.timeout(60000) });
            return response.text;
        } catch (e) {
            return `[Summary failed: ${e.message}]`;
        }
    }
}
