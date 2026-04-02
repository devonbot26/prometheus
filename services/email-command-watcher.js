import * as defaultBridge from '../skills/gmail/bridge.js';
import path from 'path';
import fs from 'fs';
import { QUOTA_TIERS } from '../core/quota-manager.js';

export class EmailWatcher {
    constructor(agent, io, bridge = defaultBridge) {
        this.agent = agent;
        this.io = io;
        this.bridge = bridge;
        this.sender = 'wongcw4@gmail.com';
        this.interval = 900 * 1000; // 15 minutes
        this.timer = null;
        this.statePath = path.join(process.cwd(), 'config', 'email_state.json');
        this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync(this.statePath)) {
                this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
            } else {
                this.state = { processed: [], failures: {} };
            }
        } catch (e) {
            console.error('📧 [EMAIL WATCHER] Failed to load state:', e.message);
            this.state = { processed: [], failures: {} };
        }
    }

    saveState() {
        try {
            // Keep processed list manageable (last 100 IDs)
            if (this.state.processed.length > 100) {
                this.state.processed = this.state.processed.slice(-100);
            }
            fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
        } catch (e) {
            console.error('📧 [EMAIL WATCHER] Failed to save state:', e.message);
        }
    }

    start() {
        console.log('📧 [EMAIL WATCHER] Service ready (Sync via Tick Loop).');
        // No internal timers; poll() is called by core/tick-loop.js
    }

    stop() {
        // No timers to clear
    }

    async poll() {
        try {
            // Priority: TickLoop handles resource optimization and idle windows.
            // No internal window check here anymore.

            if (this.agent.processing) {
                console.log('📧 [EMAIL WATCHER] Agent is engaged in a task. Skipping cycle.');
                return;
            }

            console.log('📧 [EMAIL WATCHER] Checking for unread instruction emails...');
            const scan = await this.bridge.gmail_scan({
                query: `from:${this.sender} is:unread`,
                maxResults: 10
            });
            if (!scan.success) {
                if (scan.error && (scan.error.includes('invalid_grant') || scan.error.includes('invalid_client'))) {
                    this.io.emit('log', '📧 [EMAIL WATCHER] ⚠️ Gmail auth expired. Run "repair gmail".');
                }
                return;
            }

            // Filter for specific sender and unread
            const unread = (scan.messages || []).filter(m => m.from.includes(this.sender));

            if (unread.length > 0) {
                this.io.emit('log', `📧 [EMAIL WATCHER] Found ${unread.length} new instruction(s).`);

                // 1. Determine Ordering (LIFO / DESC / ASC)
                // Default: Sort by newest first (DESC)
                let sorted = [...unread].sort((a, b) => b.id.localeCompare(a.id));

                const hasReverseInstruction = unread.some(m => m.snippet?.toLowerCase().includes('do previous first'));
                if (hasReverseInstruction) {
                    console.log('📧 [EMAIL WATCHER] "do previous first" detected. Sorting oldest first.');
                    sorted = [...unread].sort((a, b) => a.id.localeCompare(b.id)); // ASC
                }

                // Filter out already processed or too many failures
                const filtered = sorted.filter(m => {
                    const isProcessed = this.state.processed.includes(m.id);
                    const failureCount = this.state.failures[m.id] || 0;
                    return !isProcessed && failureCount < 3;
                });

                if (filtered.length > 0) {
                    this.io.emit('log', `📧 [EMAIL WATCHER] Processing ${filtered.length} pending instruction(s).`);
                    for (const msg of filtered) {
                        try {
                            await this.processEmail(msg, true);
                        } catch (err) {
                            console.error(`📧 [EMAIL WATCHER] Failed processing ${msg.id}:`, err.message);
                        }
                    }
                }
            }

            // 3. Retry Cycle (Read emails from last 24h)
            await this.pollReadRetries();

        } catch (e) {
            console.error('📧 [EMAIL WATCHER] Poll Error:', e.message);
        }
    }

    async pollReadRetries() {
        console.log('📧 [EMAIL WATCHER] Checking for "read" emails to retry...');
        // Fetch read emails from sender from last 24h
        const scan = await this.bridge.gmail_scan({
            query: `from:${this.sender} is:read -subject:"Got Errors" newer_than:1d`,
            maxResults: 5
        });

        if (scan.success && scan.messages && scan.messages.length > 0) {
            console.log(`📧 [EMAIL WATCHER] Found ${scan.messages.length} "read" email(s) for retry.`);
            // Sort Descending (Newest first) by default
            const sorted = [...scan.messages].sort((a, b) => b.id.localeCompare(a.id));

            // Filter out already processed or too many failures
            const filtered = sorted.filter(m => {
                const isProcessed = this.state.processed.includes(m.id);
                const failureCount = this.state.failures[m.id] || 0;

                // GEP: Strict Retry Guard - Max 3 attempts, cool-down 30 mins
                const lastAttempt = this.state.last_attempt?.[m.id] || 0;
                const cooldownPassed = (Date.now() - lastAttempt) > 30 * 60 * 1000;

                return !isProcessed && failureCount < 3 && cooldownPassed;
            });

            for (const msg of filtered) {
                try {
                    await this.processEmail(msg, false);
                } catch (err) {
                    console.error(`📧 [EMAIL WATCHER] Retry failed for ${msg.id}:`, err.message);
                }
            }
        }
        console.log('📧 [EMAIL WATCHER] Retry cycle complete.');
    }

    async processEmail(msg, isNew = true) {
        const subject = msg.subject;
        const body = msg.snippet;
        const id = msg.id;

        // Security Blocklist
        const blocklist = ['rm -rf', 'format ', 'delete ', 'DROP TABLE'];
        if (blocklist.some(pattern => subject.toLowerCase().includes(pattern))) {
            console.warn(`🛑 [SECURITY] Blocked destructive email command: ${subject}`);
            await this.bridge.gmail_reply(msg, `❌ SECURITY ALERT: Command "${subject}" was blocked because it contains potentially destructive patterns.`);
            await this.bridge.gmail_mark_read(id);
            return;
        }

        this.io.emit('status', `Processing Email: ${subject}`);
        this.io.emit('log', `📧 [EMAIL CMD] Executing: ${subject}`);

        // History Snapshot & Isolation
        const savedHistory = [...this.agent.history];
        const savedMode = this.agent.activeMode;
        this.agent.history = []; // Clear for stateless execution
        this.agent.setMode('primary'); // Reset to primary to enable prefix-based defaulting

        try {
            const processWithRetry = async (attempt = 1) => {
                try {
                    return await this.agent.process(subject, QUOTA_TIERS.AUTOMATED, (chunk) => {
                        // We don't stream to dashboard chat history to avoid pollution,
                        // but we could stream reasoning if needed.
                    });
                } catch (e) {
                    if (attempt === 1 && (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED'))) {
                        console.log(`💤 [EMAIL WATCHER] Model cold start detected for "${subject}". Waking up...`);
                        this.io.emit('log', `📧 [EMAIL WATCHER] Model is sleeping. Waking up to process: ${subject}`);
                        
                        if (process.send && process.connected) {
                            try { process.send({ type: 'RESTART_LLAMA' }); } catch(err) {}
                        }

                        // Wait 20 seconds for model boot and retry
                        await new Promise(resolve => setTimeout(resolve, 20000));
                        return await processWithRetry(attempt + 1);
                    }
                    throw e;
                }
            };

            const result = await processWithRetry();

            // Restore history and mode
            this.agent.history = savedHistory;
            this.agent.setMode(savedMode);

            // Reply with result
            const replyBody = `✅ Instruction Processed: ${subject}\n\nRESULT:\n${result.text}`;
            const reply = await this.bridge.gmail_reply(msg, replyBody);

            if (reply.success) {
                await this.bridge.gmail_mark_read(id);

                // Track success
                this.state.processed.push(id);
                delete this.state.failures[id];
                this.saveState();

                this.io.emit('log', `📧 [EMAIL CMD] Done: ${subject}`);
                this.io.emit('message', {
                    role: 'assistant',
                    content: `📧 Received email instruction: **${subject}** and done.`
                });
            } else {
                throw new Error('Failed to send reply email.');
            }

        } catch (e) {
            this.agent.history = savedHistory;
            this.agent.setMode(savedMode);
            console.error(`📧 [EMAIL CMD] Failed: ${subject}`, e.message);

            // "Got Errors" Reply
            const errorBody = `⚠️ Instruction Failed: ${subject}\n\nERROR:\n${e.message}\n\nPrometheus tried to self-repair but encountered issues. Please verify manually.`;
            await this.bridge.gmail_reply(msg, errorBody); // Send even if repair failed
            await this.bridge.gmail_mark_read(id); // Mark as read as per instructions

            // Track failure
            this.state.failures[id] = (this.state.failures[id] || 0) + 1;
            if (!this.state.last_attempt) this.state.last_attempt = {};
            this.state.last_attempt[id] = Date.now();
            this.saveState();

            this.io.emit('log', `📧 [EMAIL CMD] ❌ Error processing "${subject}": ${e.message}`);
        } finally {
            this.io.emit('status', 'Idle');
        }
    }
}
