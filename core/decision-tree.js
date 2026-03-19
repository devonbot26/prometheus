/**
 * Prometheus Decision Tree Engine
 * Replaces simple keyword matching with a weighted scoring system to
 * resolve user intent and inject the most appropriate tools.
 */

import { logDebug } from './logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Skill Definitions for Intent Scoring
 * Triggers: +3 points (Strong correlation)
 * Context Hints: +1 point (Weak correlation)
 */
export let INTENT_SCHEMA = {
    'gmail': {
        triggers: ['email', 'gmail', 'inbox', 'draft', 'send mail', 'unread', 'new email', 'check inbox'],
        context_hints: ['message', 'threads', 'reply', 'mail'] // Removed 'contact' to avoid misfire on people names
    },
    'google-drive': {
        triggers: ['drive', 'google drive', 'backup memory', 'restore memory'],
        context_hints: ['cloud', 'sync', 'upload', 'download']
    },
    'web-search': {
        triggers: ['search', 'google', 'look up', 'find online'],
        context_hints: ['browse', 'web', 'internet', 'query']
    },
    'web-scraper': {
        triggers: ['scrape', 'fetch url', 'extract text', 'read page'],
        context_hints: ['http', 'website', 'dom', 'content']
    },
    'terminal': {
        triggers: ['terminal', 'shell', 'bash', 'run command', 'execute', 'list files', 'project structure'],
        context_hints: ['script', 'process', 'kill', 'list', 'folder', 'directory']
    },
    'sys-admin': {
        triggers: ['git', 'commit', 'push', 'pull', 'status'],
        context_hints: ['repo', 'branch', 'version', 'system']
    },
    'weather': {
        triggers: ['weather', 'forecast', 'temperature'],
        context_hints: ['rain', 'sunny', 'outside', 'climate']
    },
    'knowledge-base': {
        triggers: ['knowledge', 'remember', 'memory', 'learn this', 'save to memory', 'Prometheus', 'PacManSwift', 'Minicraft-mac', 'Project 649'],
        context_hints: ['recall', 'fact', 'store', 'location', 'project', 'values', 'documentation']
    },
    'self-coder': {
        triggers: ['skill', 'patch', 'implement', 'create tool', 'fix code', 'write test'],
        context_hints: ['coding', 'script', 'react', 'component', 'function', 'bug']
    },
    'collab-board': {
        triggers: ['collab', 'board', 'leave a message', 'team chat'],
        context_hints: ['message', 'post', 'discuss']
    },
    'reddit-observer': {
        triggers: ['reddit', 'subreddit', 'r/'],
        context_hints: ['sentiment', 'forum', 'post', 'comments']
    },
    'youtube-analyst': {
        triggers: ['transcript', 'summarize video', 'video caption'],
        context_hints: ['watch', 'channel', 'captions']
    },
    'youtube-downloader': {
        triggers: ['download', 'mp3', 'convert to audio', 'save video'],
        context_hints: ['playlist', 'song', 'music', 'quality', 'artist', 'singer', 'mix', 'chapters']
    },
    'obsidian': {
        triggers: ['obsidian', 'vault', 'note'],
        context_hints: ['markdown', 'write', 'document']
    },
    'obsidian-librarian': {
        triggers: ['librarian', 'consolidate notes', 'scattered', 'duplicate notes'],
        context_hints: ['organize', 'cleanup', 'tag', 'structure']
    },
    'team-manager': {
        triggers: ['team', 'handoff', 'delegate', 'project plan', 'task outline'],
        context_hints: ['manage', 'assign', 'status', 'progress']
    },
    'opencode': {
        triggers: ['opencode', 'complex code', 'heavy refactor'],
        context_hints: ['ide', 'editor', 'massive', 'project root']
    },
    'health-check': {
        triggers: ['diagnose', 'system health', 'error logs', 'troubleshoot', 'why did it fail', 'err-', 'syntaxerror', 'timeout'],
        context_hints: ['crash', 'fix', 'symptoms', 'dead-end', 'system_diagnosis']
    },
    'twitter-assistant': {
        triggers: ['tweet', 'post to x', 'twitter', 'find trends', 'trending now', 'monitor account'],
        context_hints: ['social media', 'announcement', 'hashtag', 'viral', 'feed']
    },
    'github': {
        triggers: ['github', 'repo', 'pull request', 'issue', 'pr'],
        context_hints: ['git', 'remote', 'repository', 'gh']
    },
    'git': {
        triggers: ['git log', 'git status', 'git diff', 'git show', 'local git'],
        context_hints: ['history', 'changes', 'commits', 'version control']
    }
};

// Session-level intent memory to track loops
let sessionIntentHistory = [];
const LOOP_THRESHOLD = 3;

/**
 * Resolves the top skills to inject based on a weighted score.
 * Upgraded to v3: Stateful, Loop-Aware, and Negation-Sensitive.
 */
export function resolveIntent(userMessage, recentHistory, availableSkills, lastError = null) {
    const context = (recentHistory || '').toLowerCase();
    const prompt = (userMessage || '').toLowerCase();
    const scores = {};

    // 0. Load User Manual Boosts
    let userBoosts = {};
    try {
        const boostPath = path.join(process.cwd(), 'config', 'user_priority.json');
        if (fs.existsSync(boostPath)) {
            userBoosts = JSON.parse(fs.readFileSync(boostPath, 'utf-8'));
        }
    } catch (e) { /* silent fail */ }

    // Initialize scores
    Object.keys(INTENT_SCHEMA).forEach(skill => scores[skill] = (userBoosts[skill] || 0));

    // 0.1 Semantic Negation Pattern Detection
    const negations = ['stop', 'don\'t', 'dont', 'wrong', 'no ', 'not ', 'avoid', 'without'];
    const isNegated = (target) => {
        const words = prompt.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").split(/\s+/);
        const idx = words.findIndex(w => target.includes(w) || w.includes(target));
        if (idx === -1) return false;
        // Check up to 4 words before the target for negation
        const contextWindow = words.slice(Math.max(0, idx - 4), idx);
        return contextWindow.some(w => negations.some(n => w.startsWith(n.trim())));
    };

    // Calculate weighted scores
    for (const [skill, schema] of Object.entries(INTENT_SCHEMA)) {
        if (availableSkills && !availableSkills.has(skill)) continue;

        let score = scores[skill];

        // 1. Current Prompt Match (Weight: 2x)
        schema.triggers.forEach(trigger => {
            if (prompt.includes(trigger)) {
                if (isNegated(trigger)) {
                    score -= 20; // Heavy penalty for "Don't use [trigger]"
                    logDebug(`🚫 Negation detected for ${skill} via "${trigger}"`);
                } else {
                    score += 6;
                }
            }
        });
        schema.context_hints.forEach(hint => {
            if (prompt.includes(hint)) score += 2;
        });

        // 2. Historical Context Match (Weight: 1x)
        schema.triggers.forEach(trigger => {
            if (context.includes(trigger)) score += 3;
        });

        // 3. Reactive Error Triggers (Self-Healing)
        if (lastError) {
            const err = lastError.toLowerCase();
            if (skill === 'health-check' && (err.includes('permission') || err.includes('operation not permitted') || err.includes('tcc'))) {
                score += 15; // Pivot to diagnosis if permission error
            }
            if (skill === 'sys-admin' && err.includes('eaddrinuse')) {
                score += 15; // Manage ports if busy
            }
            if (skill === 'self-coder' && (err.includes('syntax') || err.includes('unexpected token'))) {
                score += 10; // Fix code if syntax error
            }
        }

        scores[skill] = score;
    }

    // 4. Intent Loop Penalty (v3 Core Innovation)
    // We track the last 5 intents. If the same top skill persists > threshold, we decay it.
    sessionIntentHistory.push(userMessage.substring(0, 50));
    if (sessionIntentHistory.length > 5) sessionIntentHistory.shift();

    const topCandidate = Object.entries(scores).sort((a,b) => b[1] - a[1])[0];
    if (topCandidate) {
        const [skill, score] = topCandidate;
        // Detect repetitions in message (proxy for loops)
        const repeats = sessionIntentHistory.filter(m => m === userMessage.substring(0, 50)).length;
        if (repeats >= LOOP_THRESHOLD) {
            const penalty = (repeats - (LOOP_THRESHOLD - 1)) * 8;
            scores[skill] -= penalty;
            logDebug(`⚠️ [LOOP PENALTY] Repeated intent detected for ${skill}. Penalty: -${penalty}`);
            
            // Force injection of safety tools when stuck
            scores['health-check'] = (scores['health-check'] || 0) + 10;
            scores['team-manager'] = (scores['team-manager'] || 0) + 5;
        }
    }

    // Sort by final score descending
    const ranked = Object.entries(scores)
        .filter(([_, score]) => score > 0)
        .sort((a, b) => b[1] - a[1]);

    if (ranked.length > 0) {
        console.log(`\n\x1b[35m🎯 Intent Debugging (v3-Hardened):\x1b[0m`);
        ranked.slice(0, 5).forEach(([skill, score]) => {
            console.log(`   - ${skill.padEnd(20)}: ${score}`);
        });
    }

    const topSkills = ranked.slice(0, 2).map(([skill, _]) => skill);
    const isCodeOrSystem = (prompt + context).includes('file') || (prompt + context).includes('dir') || (prompt + context).includes('path') || (prompt + context).includes('bug');
    
    if (isCodeOrSystem && !topSkills.includes('terminal') && (!availableSkills || availableSkills.has('terminal'))) {
        topSkills.push('terminal');
    }

    return {
        skills: topSkills.slice(0, 3).filter(s => scores[s] > -10), // Suppress heavily negated skills
        debug: { ranked: ranked.slice(0, 5), loops: sessionIntentHistory.length }
    };
}

/**
 * Register a new intent schema dynamically (e.g. from MCP)
 * @param {string} skillName 
 * @param {object} schema { triggers: [], context_hints: [] }
 */
export function registerIntent(skillName, schema) {
    if (schema && (schema.triggers || schema.context_hints)) {
        // Initialize if doesn't exist
        if (!INTENT_SCHEMA[skillName]) {
            INTENT_SCHEMA[skillName] = { triggers: [], context_hints: [] };
        }

        // Append new triggers (avoiding duplicates)
        if (schema.triggers) {
            schema.triggers.forEach(t => {
                if (!INTENT_SCHEMA[skillName].triggers.includes(t)) {
                    INTENT_SCHEMA[skillName].triggers.push(t);
                }
            });
        }

        // Append new hints (avoiding duplicates)
        if (schema.context_hints) {
            schema.context_hints.forEach(h => {
                if (!INTENT_SCHEMA[skillName].context_hints.includes(h)) {
                    INTENT_SCHEMA[skillName].context_hints.push(h);
                }
            });
        }

        logDebug(`[DEBUG] DecisionTree: Registered additional intents/hints for ${skillName}`);
    }
}
/**
 * Updates the user priority for a specific skill and persists it.
 * @param {string} skillId 
 * @param {number} boost 
 */
export function updatePriority(skillId, boost) {
    const boostPath = path.join(process.cwd(), 'config', 'user_priority.json');
    let userBoosts = {};

    try {
        if (fs.existsSync(boostPath)) {
            userBoosts = JSON.parse(fs.readFileSync(boostPath, 'utf-8'));
        }

        userBoosts[skillId] = (userBoosts[skillId] || 0) + boost;

        // Cap boost at 50 for stability
        if (userBoosts[skillId] > 50) userBoosts[skillId] = 50;
        if (userBoosts[skillId] < -50) userBoosts[skillId] = -50;

        fs.writeFileSync(boostPath, JSON.stringify(userBoosts, null, 4));
        console.log(`\n\x1b[32m✨ Priority Updated: ${skillId} boost is now ${userBoosts[skillId]}\x1b[0m`);
        return { success: true, new_boost: userBoosts[skillId] };
    } catch (e) {
        console.error('⚠️ Failed to update priority:', e.message);
        return { error: e.message };
    }
}
