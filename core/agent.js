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

export class Agent {
    constructor() {
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
     * Process a user message and return the assistant's response
     * @param {string} userMessage
     * @returns {Promise<string>}
     */
    async process(userMessage) {
        // Add user message to history
        this.history.push({ role: 'user', content: userMessage });

        // Build messages array for LLM
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.history
        ];

        // Determine if this should use local model (privacy check)
        const isPrivate = this.isPrivateRequest(userMessage);

        // Get LLM response
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
                const result = await executeTool(this.skills, toolCall.tool, toolCall.args);

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
