process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [FATAL PREVENTED] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ [FATAL PREVENTED] Uncaught Exception:', err);
});

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Agent } from '../core/agent.js';
import { mcpManager } from '../core/mcp-client.js';
import { EmailWatcher } from '../services/email-command-watcher.js';
import { projectIndexer } from '../services/project-indexer.js';
import { initCronJobs } from '../core/cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../public');
const CONFIG_PATH = path.join(__dirname, '../mcp-servers.json');

// IPC Activity Helper
function sendHeartbeat() {
    if (process.send && process.connected) {
        try {
            process.send({ type: 'ACTIVITY' });
        } catch (e) {
            // Silently ignore IPC errors as they usually mean the parent is shutting down
        }
    }
}


// Initialize MCP, Indexer and Agent
await mcpManager.initialize();
await projectIndexer.initialize();
const agent = new Agent();
agent.registerExternalSkills(mcpManager.getCapabilitiesAsNativeSkills());

// Initialize Web Server
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve Static Files and JSON
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// Start Autonomous Services
const emailWatcher = new EmailWatcher(agent, io);
emailWatcher.start();

// Initialize background cron jobs
initCronJobs(agent, (output) => {
    io.emit('agent_output', { text: output });
});

// --- MCP Hub API ---
app.get('/api/mcp/config', (req, res) => {
    res.json(mcpManager.getServerStatus());
});

app.post('/api/mcp/toggle', async (req, res) => {
    try {
        const { name, disabled } = req.body;
        let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

        const server = config.servers.find(s => s.name === name);
        if (server) {
            server.disabled = disabled;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

            await mcpManager.reloadConfig();
            agent.registerExternalSkills(mcpManager.getCapabilitiesAsNativeSkills());

            res.json({ success: true, status: mcpManager.getServerStatus() });
        } else {
            res.status(404).json({ error: 'Server not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Request Queue System
const MAX_QUEUE_SIZE = 5;
const requestQueue = [];
let isProcessingQueue = false;

// Handle Socket Connections
io.on('connection', (socket) => {
    console.log('🌐 Web Client Connected');

    // Send stats and history on connection
    socket.emit('usage', agent.quotaTracker.getStats());
    socket.emit('history', agent.history);

    // GEP Gene: Auto-Resume Project Loop for Web
    const pmStatePath = path.resolve(process.cwd(), 'PM_STATE.json');
    if (agent.activeMode === 'primary' && fs.existsSync(pmStatePath) && requestQueue.length === 0 && !isProcessingQueue) {
        try {
            const stateText = fs.readFileSync(pmStatePath, 'utf8').trim();
            if (stateText) {
                const state = JSON.parse(stateText);
                const pending = (state.steps || []).some(s => s.status === 'pending');
                if (pending) {
                    // Check if already in queue to prevent double-nudge
                    const alreadyQueued = requestQueue.some(r => r.text === 'get_next_step');
                    if (!alreadyQueued) {
                        if (process.send) process.send({ type: 'ACTIVITY' });
                    console.log(`\n🤖 [WEB AUTO-RESUME] Project plan detected. Nudging Niki...\n`);
                        setTimeout(() => {
                            if (isProcessingQueue) return; // Final guard
                            agent.setMode('team-manager');
                            socket.emit('status', 'Resuming Project...');
                            requestQueue.push({ 
                                text: 'get_next_step', 
                                resolve: () => {}, 
                                reject: () => {} 
                            });
                            processQueue();
                        }, 1000);
                    }
                }
            }
            if (msg.type === 'MODEL_SLEEPING') {
                socket.emit('status', '💤 Model sleeping (will wake on demand)');
            }

        } catch (e) { /* ignore */ }
    }

    const processQueue = async (autoStep = 0) => {
        if (isProcessingQueue || requestQueue.length === 0) return;
        isProcessingQueue = true;

        const { text, resolve, reject } = requestQueue.shift();

        try {
            socket.emit('status', 'Thinking...');
            if (autoStep === 0) {
                socket.emit('message', { role: 'user', content: text });
            }

            const result = await (async () => {
                // Heartbeat to parent to prevent idle timeout during long reasoning
                const heartbeatInterval = setInterval(sendHeartbeat, 30000);
                try {
                    return await agent.process(text, undefined, (chunk, isReasoning) => {
                        if (isReasoning && agent.showThinking) {
                            socket.emit('think_stream', chunk);
                        }
                    });
                } finally {
                    clearInterval(heartbeatInterval);
                }
            })();


            // Handle Auto-Continue Relay (Agent-to-Agent)
            if (result.auto_continue && autoStep < 10) {
                const handoffPath = path.resolve(process.cwd(), 'HANDOFF.json');
                if (fs.existsSync(handoffPath)) {
                    const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8'));
                    const wakeUp = `[SYSTEM] You are now the ${handoff.to}. Your task: ${handoff.context}`;
                    console.log(`\n🤖 Web Relay [Step ${autoStep + 1}/10]: Waking ${handoff.to}...\n`);
                    
                    agent.setMode(handoff.to);
                    isProcessingQueue = false;
                    requestQueue.unshift({ text: wakeUp, resolve, reject });
                    return processQueue(autoStep + 1);
                }
            }

            resolve(result);
        } catch (e) {
            reject(e);
        } finally {
            isProcessingQueue = false;
            if (requestQueue.length > 0) {
                socket.emit('status', `Queued (${requestQueue.length} pending)...`);
                processQueue();
            } else {
                socket.emit('status', 'Idle');
            }
        }
    };

    // Handle incoming messages from UI
    socket.on('message', async (text) => {
        sendHeartbeat();

        if (requestQueue.length >= MAX_QUEUE_SIZE) {
            socket.emit('message', { role: 'assistant', content: `⚠️ Queue is full (${MAX_QUEUE_SIZE}). Please wait before sending more prompts.` });
            return;
        }

        return new Promise((resolve, reject) => {
            requestQueue.push({ text, resolve, reject });
            
            if (isProcessingQueue) {
                socket.emit('status', `Queued (${requestQueue.length} pending)...`);
            } else {
                processQueue();
            }
        }).catch(async (e) => {
            if (e.message !== "ABORTED_BY_USER") {
                // Cold Start Detection: If model is unloaded, wake it up and retry
                if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
                    socket.emit('status', '🔌 Model is sleeping. Waking up...');
                    socket.emit('log', '💤 Cold start detected. Sending wake-up signal to Llama Server...');
                    
                    if (process.send && process.connected) {
                        try { process.send({ type: 'RESTART_LLAMA' }); } catch(err) {}
                    }

                    // Re-queue the message for retry after 20s
                    setTimeout(() => {
                        socket.emit('status', 'Retrying...');
                        requestQueue.unshift({ text, resolve, reject });
                        processQueue();
                    }, 20000);
                    return;
                }

                socket.emit('status', 'Error');
                socket.emit('message', { role: 'assistant', content: `⚠️ Error: ${e.message}` });
            }
        });

    });

    // Handle cancellation from UI
    socket.on('stop', () => {
        console.log('🛑 UI requested stop. Clearing queue and halting agent...');
        requestQueue.length = 0; // Clear the queue
        agent.stop();
        socket.emit('status', 'Interrupted');
    });
});

// Bind Agent Events to Socket.io
agent.on('usage', (stats) => {
    io.emit('usage', stats);
});

agent.on('message', (msg) => {
    io.emit('message', msg);
});

agent.on('tool_start', (data) => {
    io.emit('tool_start', data);
    io.emit('log', `🔧 Calling tool: ${data.tool}`);
    io.emit('status', `Executing: ${data.tool}...`);
});

agent.on('tool_end', (data) => {
    io.emit('tool_end', data);
    if (data.result && data.result.error) {
        io.emit('log', `❌ Tool error (${data.tool}): ${data.result.error}`);
    } else {
        io.emit('log', `✅ Tool finished: ${data.tool}`);
    }
    io.emit('status', 'Thinking...');
});

agent.on('terminal_stream', (chunk) => {
    io.emit('terminal_stream', chunk);
});

agent.on('memory_pressure', (data) => {
    io.emit('memory_pressure', data);
});

agent.on('intent_trace', (data) => {
    console.log('[DEBUG] Intent Trace Relay:', data.ranked[0]);
    io.emit('intent_trace', data);
});

// --- IPTV API ---
app.get('/api/tv/channels', (req, res) => {
    try {
        const filePath = '/Users/nelsonwong/Documents/projects/iptv/lists/zz_news_en.md';
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'IPTV list not found at ' + filePath });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const groupedChannels = [];
        let currentCategory = "General";

        // Simple Markdown Table & Header Parser
        for (const line of lines) {
            const hMatch = line.match(/<h1>(.*?)<\/h1>/i);
            if (hMatch) {
                currentCategory = hMatch[1].trim();
                continue;
            }

            if (line.includes('[>]')) {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 4) {
                    const name = parts[2].replace(/[^a-zA-Z0-9\s().]/g, '').trim();
                    const urlMatch = parts[3].match(/\((.*?)\)/);
                    const logoMatch = parts[4].match(/src="(.*?)"/);

                    if (urlMatch) {
                        let cat = groupedChannels.find(g => g.category === currentCategory);
                        if (!cat) {
                            cat = { category: currentCategory, channels: [] };
                            groupedChannels.push(cat);
                        }
                        cat.channels.push({
                            name,
                            url: urlMatch[1],
                            logo: logoMatch ? logoMatch[1] : null
                        });
                    }
                }
            }
        }
        res.json(groupedChannels);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start Server
const PORT = 3000;
import os from 'os';

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Prometheus Dashboard: http://localhost:${PORT}`);

    // Find Local IP for network access
    const interfaces = os.networkInterfaces();
    let localIp = 'Unknown';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIp = iface.address;
                break;
            }
        }
        if (localIp !== 'Unknown') break;
    }

    console.log(`🌍 LAN Access (Other devices): http://${localIp}:${PORT}`);
    console.log(`🧠 Agent loaded with ${agent.skills.size} skills.`);
});
