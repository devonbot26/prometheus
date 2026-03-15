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
import { execSync } from 'child_process';
import { Agent, ROLE_MODEL_MAP } from '../core/agent.js';
import { mcpManager } from '../core/mcp-client.js';
import { EmailWatcher } from '../services/email-command-watcher.js';
import { memoryManager } from '../core/memory-manager.js';
import { initCronJobs } from '../core/cron.js';
import { INTENT_SCHEMA } from '../core/decision-tree.js';
import { projectIndexer } from '../services/project-indexer.js';

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
let currentMlxState = 'offline'; 

// Initial Health Check on boot to avoid missing supervisor signals
import fetch from 'node-fetch';
async function initialHealthCheck() {
    try {
        const res = await fetch('http://127.0.0.1:18888/v1/models', { timeout: 2000 });
        if (res.ok) {
            currentMlxState = 'online';
            console.log('🧠 [WEB] Initial check: MLX Server is ONLINE');
        }
    } catch (e) {
        console.log('🧠 [WEB] Initial check: MLX Server is OFFLINE');
    }
}
initialHealthCheck();

// Listen for Model Updates and State Changes from Supervisor
process.on('message', (msg) => {
    if (msg.type === 'MODEL_UPDATED') {
        console.log(`🧠 [WEB] Syncing environment to new model: ${msg.model}`);
        process.env.LLM_MODEL = msg.model;
        if (global.io) {
            global.io.emit('model_info', msg.model);
        }
    }
    if (msg.type === 'MODEL_STATE_CHANGE') {
        if (global.io) {
            currentMlxState = msg.state;
            global.io.emit('mlx_status', { state: msg.state, model: msg.model });
            
            // If brain becomes online, trigger greeting for all
            if (msg.state === 'online') {
                sendWelcome(global.io);
            }
        }
    }
    if (msg.type === 'MODEL_SLEEPING') {
        console.log('📡 [WEB] Syncing model sleep state...');
        if (global.io) {
            global.io.emit('status', '💤 Model sleeping (will wake on demand)');
            global.io.emit('model_info', 'Sleeping');
        }
    }
});

agent.registerExternalSkills(mcpManager.getCapabilitiesAsNativeSkills());

// Initialize Web Server
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
global.io = io; // Expose globally for IPC handlers

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

app.get('/api/system/stats', (req, res) => {
    try {
        const pressureOutput = execSync('sysctl -n kern.memorystatus_vm_pressure_level').toString().trim();
        console.log(`📊 [WEB] System Stats Request - Pressure: ${pressureOutput}`);
        res.json({
            memoryPressure: parseInt(pressureOutput) || 1,
            model: process.env.LLM_MODEL || 'default'
        });
    } catch (e) {
        console.error('📊 [WEB] Stats Error:', e.message);
        res.json({ memoryPressure: 1, model: 'unknown' });
    }
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

/**
 * Fast-rendering greeting engine to provide instant context
 */
async function sendWelcome(target = global.io) {
    console.log('🤖 [WEB] Triggering welcome sequence...');
    try {
        const pmStatePath = path.resolve(process.cwd(), 'PM_STATE.json');
        let projectSummary = "I'm ready for your next command.";
        
        if (fs.existsSync(pmStatePath)) {
            const state = JSON.parse(fs.readFileSync(pmStatePath, 'utf8'));
            const nextStep = (state.steps || []).find(s => s.status === 'pending');
            if (nextStep) {
                projectSummary = `I'm currently tracking the project **${state.project_name}**. \n\nNext pending task: *${nextStep.description}*`;
            } else if (state.project_name) {
                projectSummary = `Project **${state.project_name}** appears to be completed. Standing by for new objectives.`;
            }
        }

        const greeting = `🚀 **Prometheus Online.** \n\n${projectSummary}`;
        target.emit('message', { role: 'assistant', content: greeting });
        target.emit('status', 'Idle');
    } catch (e) {
        console.error('Error in welcome sequence:', e);
    }
}

// Handle Socket Connections
io.on('connection', (socket) => {
    console.log(`📡 [WEB] Socket connected: ${socket.id}`);

    // Send initial boot sequence
    socket.emit('clear_console');
    socket.emit('status', 'System Initializing...');
    
    // Boot Phase Simulation/Check
    const bootPhases = [
        { phase: 1, msg: '🔗 Bridge Link Established', delay: 100 },
        { phase: 2, msg: '📡 Supervisor Sync Complete', delay: 400 },
        { phase: 3, msg: '🧠 Verifying Brain Readiness...', delay: 800 }
    ];

    bootPhases.forEach((p, i) => {
        setTimeout(() => {
            socket.emit('log', p.msg);
            if (p.phase === 3) {
                if (currentMlxState === 'online') {
                    socket.emit('log', '✅ MLX Server Ready');
                    socket.emit('log', '📥 Restoring Project Context...');
                    setTimeout(() => sendWelcome(socket), 500);
                } else {
                    socket.emit('log', '💤 Brain is sleeping (Cold start may be required)');
                    socket.emit('status', 'Idle');
                }
            }
        }, p.delay);
    });

    // Send stats, history (delayed), and model on connection
    socket.emit('usage', agent.quotaTracker.getStats());
    socket.emit('model_info', process.env.LLM_MODEL || 'Unknown');
    broadcastSkills(socket);
    broadcastKnowledge(socket);
    broadcastMemories(socket);
    broadcastContext(socket);
    
    // Lazy history load
    setTimeout(() => {
        socket.emit('history', agent.history);
    }, 1500);

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

        } catch (e) { /* ignore */ }
    }

    const processQueue = async (autoStep = 0) => {
        if (isProcessingQueue || requestQueue.length === 0) return;
        isProcessingQueue = true;

        const { text, draftMode, resolve, reject } = requestQueue.shift();

        try {
            socket.emit('status', 'Thinking...');
            if (autoStep === 0) {
                // socket.emit('message', { role: 'user', content: text }); // REMOVED: Handled by agent.on('message') broadcast below
            }

            const result = await (async () => {
                // Heartbeat to parent to prevent idle timeout during long reasoning
                const heartbeatInterval = setInterval(sendHeartbeat, 30000);
                const originalMode = agent.activeMode;
                try {
                    if (draftMode) {
                        agent.setMode('prompt-engineer');
                    }
                    return await agent.process(text, undefined, (chunk, isReasoning) => {
                        if (isReasoning && agent.showThinking) {
                            socket.emit('think_stream', chunk);
                        }
                    });
                } finally {
                    clearInterval(heartbeatInterval);
                    if (draftMode) {
                        agent.setMode(originalMode);
                    }
                }
            })();


            // Handle Auto-Continue Relay (Agent-to-Agent)
            if (result.auto_continue && autoStep < 10) {
                const handoffPath = path.resolve(process.cwd(), 'HANDOFF.json');
                if (fs.existsSync(handoffPath)) {
                    const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8'));
                    const wakeUp = handoff.context;
                    const targetRole = handoff.to;

                    // Phase 48: Intelligent Brain Routing interceptor
                    const roleConfig = ROLE_MODEL_MAP[targetRole] || ROLE_MODEL_MAP[`team-${targetRole}`];
                    const activeModel = process.env.LLM_MODEL || "";
                    
                    if (roleConfig && roleConfig.modelId && roleConfig.modelId !== activeModel) {
                        console.log(`\n🧠 [ROUTER] Role ${targetRole} requires model: ${roleConfig.modelId}`);
                        console.log(`\x1b[33m🔄 [ROUTER] Hot-swapping model from ${activeModel} to specialized brain...\x1b[0m`);
                        
                        socket.emit('status', `Swapping brain for ${targetRole}...`);
                        socket.emit('log', `🧠 Brain change: Switching to specialized ${targetRole} model.`);

                        if (process.send) {
                            process.send({ type: 'RESTART_LLAMA', model: roleConfig.modelId });
                            
                            // Wait for model update before continuing
                            await new Promise((resolveWait) => {
                                const timeout = setTimeout(() => {
                                    console.warn('⚠️ [ROUTER] Brain swap timed out. Proceeding with current model.');
                                    resolveWait();
                                }, 60000); // 60s max wait
                                
                                const modelUpdateHandler = (m) => {
                                    if (m.type === 'MODEL_UPDATED' && m.model === roleConfig.modelId) {
                                        clearTimeout(timeout);
                                        process.removeListener('message', modelUpdateHandler);
                                        console.log(`✅ [ROUTER] Brain swap complete. Resuming task.`);
                                        resolveWait();
                                    }
                                };
                                process.on('message', modelUpdateHandler);
                            });
                        }
                    }

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

    socket.on('mlx_control', (data) => {
        const action = typeof data === 'string' ? data : data.action;
        const model = typeof data === 'object' ? data.model : null;
        
        console.log(`🕹️ [WEB] Manual MLX Control: ${action} ${model || ''}`);
        
        if (process.send) {
            let type = 'RESTART_LLAMA';
            if (action === 'stop') type = 'STOP_LLAMA';
            
            process.send({ 
                type, 
                model: model || process.env.LLM_MODEL,
                forceClean: true 
            });
        }
    });

    // Handle incoming messages from UI
    socket.on('message', async (data) => {
        sendHeartbeat();
        const text = typeof data === 'string' ? data : data.text;
        const draftMode = typeof data === 'object' ? data.draftMode : false;

        if (text.startsWith('/')) {
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();
            if (cmd === '/model') {
                const arg = args[1];
                console.log(`\n🧠 [WEB] Model change requested: ${arg || 'list'}\n`);
                const MODEL_ID_MAP = {
                    '1': 'mlx-community/DeepSeek-R1-Distill-Qwen-14B-abliterated-v2-Q4-mlx',
                    '2': 'mlx-community/Qwen2.5-Coder-14B-4bit',
                    '3': 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit',
                    '4': '/Users/nelsonwong/Documents/projects/Prometheus/models/Qwen3.5-9B-Claude-Abliterated-mxfp4'
                };
                const modelId = MODEL_ID_MAP[arg] || arg;
                if (!modelId) {
                    socket.emit('message', { role: 'assistant', content: `🧠 Usage: /model [id|name]\nPresets: 1(DeepSeek), 2(Coder), 3(Qwen9B), 4(MXFP4-9B)` });
                    return;
                }
                if (process.send) {
                    console.log(`📡 [WEB] Sending RESTART_LLAMA IPC sync for ${modelId}`);
                    process.send({ type: 'RESTART_LLAMA', model: modelId });
                    socket.emit('message', { role: 'assistant', content: `🔄 Switching model to: **${modelId}**... The server will restart. Please wait ~30s.` });
                } else {
                    console.error(`❌ [WEB] process.send is missing! Cannot signal supervisor.`);
                    socket.emit('message', { role: 'assistant', content: `❌ Supervisor not detected. Cannot switch models via web UI.` });
                }
                return;
            }
        }

        if (requestQueue.length >= MAX_QUEUE_SIZE) {
            socket.emit('message', { role: 'assistant', content: `⚠️ Queue is full (${MAX_QUEUE_SIZE}). Please wait before sending more prompts.` });
            return;
        }

        return new Promise((resolve, reject) => {
            requestQueue.push({ text, draftMode, resolve, reject });
            
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

    socket.on('skill_toggle', (data) => {
        const { name, enabled } = data;
        agent.toggleSkill(name, enabled);
        broadcastSkills(); // Refresh all clients
    });
 
    // Manual Refresh Requests
    socket.on('refresh_resources', async () => {
        broadcastSkills(socket);
        broadcastKnowledge(socket);
        broadcastMemories(socket);
        await broadcastContext();
    });
 
    // --- CONTEXT HUB ENDPOINTS ---

    /**
     * Helper to broadcast the latest state to all connected clients
     */
    /**
     * Helper to broadcast the latest state to all connected clients
     */
    async function broadcastContext(targetSocket = null) {
        try {
            const historyPath = path.join(process.cwd(), 'core', 'history.json');
            let history = [];
            if (fs.existsSync(historyPath)) {
                history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
            }
            const pmStatePath = path.join(process.cwd(), 'PM_STATE.json');
            let pmState = null;
            if (fs.existsSync(pmStatePath)) {
                pmState = JSON.parse(fs.readFileSync(pmStatePath, 'utf-8'));
            }
 
            // Load user priorities for decision tree visualization
            let userPriorities = {};
            try {
                const priorityPath = path.join(process.cwd(), 'config', 'user_priority.json');
                if (fs.existsSync(priorityPath)) {
                    userPriorities = JSON.parse(fs.readFileSync(priorityPath, 'utf-8'));
                }
            } catch (e) {}

            const data = {
                mode: agent.activeMode,
                systemPrompt: agent.systemPrompt,
                history: history,
                pmState: pmState,
                intentSchema: INTENT_SCHEMA,
                userPriorities: userPriorities
            };

            if (targetSocket) {
                targetSocket.emit('context_data', data);
            } else {
                io.emit('context_data', data);
            }
        } catch (e) {
            console.error('Error broadcasting context:', e);
        }
    }

    socket.on('request_context', async () => {
        await broadcastContext();
    });

    socket.on('update_history', async (newHistory) => {
        try {
            const historyPath = path.join(process.cwd(), 'core', 'history.json');
            fs.writeFileSync(historyPath, JSON.stringify(newHistory, null, 2));
            console.log(`🧠 [CONTEXT HUB] History trimmed and saved by user. New turn count: ${newHistory.length}`);
            socket.emit('log', `✅ Brain State Saved. Retained ${newHistory.length} interaction turns.`);
            
            // Re-broadcast to sync all clients
            await broadcastContext();
        } catch (e) {
            console.error('Error saving history:', e);
            socket.emit('log', `⚠️ Failed to save brain state: ${e.message}`);
        }
    });

    // Auto-refresh context when messages flow
    // MOVED OUTSIDE connection handler to prevent duplicate listeners
    // agent.on('message', (msg) => {
    //     io.emit('message', msg);
    //     // Refresh Hub implicitly after each assistant or user interaction to keep it live
    //     broadcastContext();
    // });

});

/**
 * Broadcasts available skills and their status to clients
 */
function broadcastSkills(socket = null) {
    const skills = Array.from(agent.skills.values())
        .filter(s => s.meta.name !== 'twitter-assistant') // Explicitly removed as requested
        .map(s => ({
            name: s.meta.name,
            description: s.meta.description,
            enabled: !agent.disabledSkills.has(s.meta.name)
        }));
    
    const target = socket || global.io;
    if (target) {
        target.emit('skills_info', skills);
    }
}
 
/**
 * Broadcasts indexed projects (Knowledge Base)
 */
function broadcastKnowledge(socket = null) {
    const projects = Array.from(projectIndexer.projects.values());
    const target = socket || global.io;
    if (target) {
        target.emit('knowledge_info', projects);
    }
}
 
/**
 * Broadcasts long-term memories
 */
function broadcastMemories(socket = null) {
    const memories = memoryManager.memories;
    const target = socket || global.io;
    if (target) {
        target.emit('memories_info', memories);
    }
}

// Bind Agent Events to Socket.io
// Moved outside io.on('connection') to prevent duplicate listeners on reconnect
agent.on('message', (msg) => {
    io.emit('message', msg);
    // Refresh Hub implicitly after each assistant or user interaction to keep it live
    // Note: this function requires the io instance which is global.io
    try {
        const pmStatePath = path.join(process.cwd(), 'PM_STATE.json');
        let pmState = null;
        if (fs.existsSync(pmStatePath)) {
            pmState = JSON.parse(fs.readFileSync(pmStatePath, 'utf-8'));
        }
        global.io.emit('context_data', {
            mode: agent.activeMode,
            pmState: pmState
        });
    } catch (e) {
        // Silent fail on context broadcast during message stream
    }
});
agent.on('usage', (stats) => {
    io.emit('usage', stats);
});

    // Handled above in broadcastContext update

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
