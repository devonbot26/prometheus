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
import { chat } from './llm.js';
import { loadSkills, executeTool, getToolDescriptions } from './skill-loader.js';
import { buildSystemPrompt } from './identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, 'history.json');

import { EventEmitter } from 'events';

export class Agent extends EventEmitter {
    constructor() {
        super();
        this.skills = loadSkills();
        this.toolDescriptions = getToolDescriptions(this.skills);
        this.systemPrompt = buildSystemPrompt(this.toolDescriptions);
        this.history = this.loadHistory();
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
     * Process a user message and return the assistant's response
     * @param {string} userMessage
     * @returns {Promise<string>}
     */
    async process(userMessage) {
        // Add user message to history
        this.history.push({ role: 'user', content: userMessage });

        let systemContext = this.systemPrompt;

        // INJECT NOTEBOOK CONTEXT
        if (this.activeNotebook) {
            systemContext += `\n\n=== ACTIVE NOTEBOOK: ${this.activeNotebook} ===\nAnswer based ONLY on the following context if possible:\n`;
            const files = fs.readdirSync(this.activeNotebook).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
            for (const file of files.slice(0, 5)) { // Limit to 5 files
                const content = fs.readFileSync(path.join(this.activeNotebook, file), 'utf-8');
                systemContext += `\n--- ${file} ---\n${content.substring(0, 3000)}\n`; // Truncate per file
            }
        }

        // Build messages array for LLM
        const messages = [
            { role: 'system', content: systemContext },
            // Few-shot training (Force the model to see how it's done)
            { role: 'user', content: 'List files in Documents' },
            { role: 'assistant', content: '```json\n{"tool": "terminal_run", "args": {"command": "ls ~/Documents"}}\n```' },
            ...this.history
        ];

        // Determine if this should use local model (privacy check)
        const isPrivate = this.isPrivateRequest(userMessage) || !!this.activeNotebook; // Force local for notebooks

        // Get LLM response
        console.log(`🔍 Context: ${systemContext.length} chars. Tools: ${this.toolDescriptions.length} chars.`);
        // console.log(this.systemPrompt); // Uncomment to see full prompt

        const response = await chat(messages, {
            forceLocal: isPrivate,
            maxTokens: 2048
        });

        let assistantText = response.text;
        const modelUsed = response.model;

        // Check if LLM wants to call a tool
        const toolCall = this.extractToolCall(assistantText);

        if (toolCall) {
            try {
                console.log(`🔧 Tool call detected: ${toolCall.tool}`);
                this.emit('tool_start', { tool: toolCall.tool, args: toolCall.args });
                const result = await executeTool(this.skills, toolCall.tool, toolCall.args);
                this.emit('tool_end', { tool: toolCall.tool, result });

                // Feed tool result back to LLM for natural response
                const toolResultMsg = `Tool "${toolCall.tool}" returned:\n${JSON.stringify(result, null, 2)}`;
                this.history.push({ role: 'assistant', content: assistantText });
                this.history.push({ role: 'user', content: toolResultMsg });

                const followUp = await chat([
                    { role: 'system', content: this.systemPrompt },
                    ...this.history
                ], { forceLocal: isPrivate, maxTokens: 2048 });

                assistantText = followUp.text;
            } catch (e) {
                assistantText = `⚠️ Tool error: ${e.message}`;
            }
        }

        // Add response to history
        this.history.push({ role: 'assistant', content: assistantText });

        // Trim history to last 20 messages to stay within context limits
        if (this.history.length > 20) {
            this.history = this.history.slice(-20);
        }

        this.saveHistory();
        this.saveHistory();
        this.emit('message', { role: 'assistant', content: assistantText, model: modelUsed });
        return { text: assistantText, model: modelUsed };
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
     * Extract a tool call JSON from LLM response
     */
    extractToolCall(text) {
        try {
            // Look for ```json { "tool": "...", "args": {...} } ``` (case insensitive, optional 'json')
            const blockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
            if (blockMatch) {
                try {
                    const parsed = JSON.parse(blockMatch[1]);
                    if (parsed.tool) return parsed;
                } catch (e) {
                    // Invalid JSON in block
                }
            }

            // Also check for inline JSON: {"tool": "..."}
            // We search for the pattern and then try to parse the object
            const inlineMatch = text.match(/\{[\s\n]*"tool"[\s\n]*:[\s\n]*"[^"]+"/);
            if (inlineMatch) {
                const start = text.indexOf(inlineMatch[0]);
                let depth = 0;
                let end = start;
                // Simple brace balancing
                for (let i = start; i < text.length; i++) {
                    if (text[i] === '{') depth++;
                    if (text[i] === '}') depth--;

                    if (depth === 0 && i > start) {
                        end = i + 1;
                        break;
                    }
                }

                if (end > start) {
                    const jsonStr = text.substring(start, end);
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.tool) return parsed;
                }
            }
        } catch {
            // Not a tool call
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
