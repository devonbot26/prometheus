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
import os from 'os';
import { SelfReflection } from '../services/self-reflection.js';

// Configuration persistence
const USER_CONFIG_PATH = path.resolve(process.cwd(), 'config.json');
let userConfig = {
    PROJECT_ROOT: process.cwd(),
    DOCUMENTS_ROOT: path.join(os.homedir(), 'Documents')
};

try {
    if (fs.existsSync(USER_CONFIG_PATH)) {
        const saved = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, 'utf-8'));
        userConfig = { ...userConfig, ...saved };
    }
    // Set environment variables for core logic to consume
    process.env.PROJECT_ROOT = userConfig.PROJECT_ROOT;
    process.env.DOCUMENTS_ROOT = userConfig.DOCUMENTS_ROOT;
} catch (e) {
    console.error('⚠️ [WEB] Failed to load config.json:', e.message);
}

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
let cachedMemoryPressure = 1;

// Background stats gathering to avoid blocking the event loop
function updateSystemStats() {
    if (os.platform() === 'darwin') {
        import('child_process').then(({ exec }) => {
            exec('sysctl -n kern.memorystatus_vm_pressure_level', (error, stdout) => {
                if (!error && stdout) {
                    cachedMemoryPressure = parseInt(stdout.trim()) || 1;
                }
            });
        });
    }
}
// Initial update and periodic refresh every 10 seconds
updateSystemStats();
setInterval(updateSystemStats, 10000);

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

const selfReflection = new SelfReflection(agent, io);
selfReflection.start();

// Initialize background cron jobs
initCronJobs(agent, (output) => {
    io.emit('agent_output', { text: output });
});

// --- MCP Hub API ---
app.get('/api/mcp/config', (req, res) => {
    res.json(mcpManager.getServerStatus());
});

app.get('/api/system/stats', (req, res) => {
    res.json({
        memoryPressure: cachedMemoryPressure,
        model: process.env.LLM_MODEL || 'default'
    });
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

/**
 * Broadcasts available skills and their status to clients
 */
function broadcastSkills(socket = null) {
    const skills = Array.from(agent.skills.values())
        .filter(s => s.meta.name !== 'twitter-assistant')
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

/**
 * Broadcasts team roles and their prompts
 */
function broadcastTeamInfo(socket = null) {
    const promptsDir = path.join(process.cwd(), 'prompts');
    const roles = [];
    
    if (fs.existsSync(promptsDir)) {
        const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
        files.forEach(file => {
            const roleName = file.replace('.md', '');
            const content = fs.readFileSync(path.join(promptsDir, file), 'utf-8');
            roles.push({
                name: roleName,
                prompt: content
            });
        });
    }

    const target = socket || global.io;
    if (target) {
        target.emit('team_info', roles);
    }
}

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
            mode: agent.activeMode,       // Legacy / Web compatibility
            activeMode: agent.activeMode, // Native Bridge compatibility
            systemPrompt: agent.systemPrompt,
            history: history,
            pmState: pmState,
            intentSchema: INTENT_SCHEMA,
            userPriorities: userPriorities
        };

        const target = targetSocket || global.io;
        if (target) {
            target.emit('context_data', data);
        }
    } catch (e) {
        console.error('Error broadcasting context:', e);
    }
}

// Handle Socket Connections
io.on('connection', (socket) => {
    console.log(`📡 [WEB] Socket connected: ${socket.id}`);

    // Send initial boot sequence
    socket.emit('clear_console');
    socket.emit('status', 'System Initializing...');

    // Native Action Result Forwarder
    socket.on('native_action_result', (result) => {
        if (global._nativeActionCallback) {
            global._nativeActionCallback(result);
            global._nativeActionCallback = null;
        }
    });
    
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

    // Send stats, history, and model on connection
    socket.emit('usage', agent.quotaTracker.getStats());
    socket.emit('model_info', process.env.LLM_MODEL || 'default');
    socket.emit('mlx_status', { state: currentMlxState, model: process.env.LLM_MODEL });
    socket.emit('config_info', userConfig);
    broadcastSkills(socket);
    broadcastKnowledge(socket);
    broadcastMemories(socket);
    broadcastTeamInfo(socket);
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
                    const alreadyQueued = requestQueue.some(r => r.text === 'get_next_step');
                    if (!alreadyQueued) {
                        if (process.send) process.send({ type: 'ACTIVITY' });
                        console.log(`\n🤖 [WEB AUTO-RESUME] Project plan detected. Nudging Niki...\n`);
                        setTimeout(() => {
                            if (isProcessingQueue) return;
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
            
            const result = await (async () => {
                const heartbeatInterval = setInterval(sendHeartbeat, 30000);
                const originalMode = agent.activeMode;
                try {
                    if (draftMode) {
                        agent.setMode('prompt-engineer');
                    }
                    return await agent.process(text, undefined, (chunk, isReasoning) => {
                        if (isReasoning && agent.showThinking) {
                            socket.emit('think_stream', chunk);
                        } else if (!isReasoning) {
                            socket.emit('content_stream', chunk);
                        }
                    });
                } finally {
                    clearInterval(heartbeatInterval);
                    if (draftMode) {
                        agent.setMode(originalMode);
                    }
                }
            })();

            // Handle Auto-Continue Relay
            if (result.auto_continue && autoStep < 10) {
                const handoffPath = path.resolve(process.cwd(), 'HANDOFF.json');
                if (fs.existsSync(handoffPath)) {
                    const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8'));
                    const wakeUp = handoff.context;
                    const targetRole = handoff.to;

                    const roleConfig = ROLE_MODEL_MAP[targetRole] || ROLE_MODEL_MAP[`team-${targetRole}`];
                    const activeModel = process.env.LLM_MODEL || "";
                    
                    if (roleConfig && roleConfig.modelId && roleConfig.modelId !== activeModel) {
                        socket.emit('status', `Swapping brain for ${targetRole}...`);
                        if (process.send) {
                            process.send({ type: 'RESTART_LLAMA', model: roleConfig.modelId });
                            await new Promise((resolveWait) => {
                                const timeout = setTimeout(resolveWait, 60000);
                                const handler = (m) => {
                                    if (m.type === 'MODEL_UPDATED' && m.model === roleConfig.modelId) {
                                        clearTimeout(timeout);
                                        process.removeListener('message', handler);
                                        resolveWait();
                                    }
                                };
                                process.on('message', handler);
                            });
                        }
                    }

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
            socket.emit('status', requestQueue.length > 0 ? `Queued (${requestQueue.length} pending)...` : 'Idle');
            processQueue(); 
        }
    };

    socket.on('mlx_control', (data) => {
        const action = typeof data === 'string' ? data : data.action;
        const model = typeof data === 'object' ? data.model : null;
        if (process.send) {
            let type = 'RESTART_LLAMA';
            if (action === 'stop') type = 'STOP_LLAMA';
            process.send({ type, model: model || process.env.LLM_MODEL, forceClean: true });
        }
    });

    socket.on('fix_zombies', async () => {
        socket.emit('log', '🧹 Cleaning up zombie processes...');
        try {
            try { execSync('pkill -9 -f "mlx_vlm.server"'); } catch (e) {}
            try { execSync('pkill -9 -f "mlx_lm"'); } catch (e) {}
            try { execSync('pkill -9 -f "uvicorn"'); } catch (e) {}
            try {
                const pids = execSync('lsof -ti:18888').toString().trim();
                if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')}`);
            } catch (e) {}
            if (process.send && process.connected) {
                process.send({ type: 'RESTART_LLAMA', model: process.env.LLM_MODEL, forceClean: true });
            }
            socket.emit('log', '✅ Zombie cleanup complete. Server restarting...');
        } catch (e) {
            socket.emit('log', `❌ Cleanup error: ${e.message}`);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`🔌 [WEB] Client disconnected: ${reason}`);
        if (agent.processing && agent.abortController) {
            agent.abortController.abort();
        }
        requestQueue.length = 0;
    });

    socket.on('message', async (data) => {
        sendHeartbeat();
        const text = typeof data === 'string' ? data : data.text;
        const draftMode = typeof data === 'object' ? data.draftMode : false;
        
        const clientTs = data.clientTimestamp || Date.now();
        const ingressLatency = Date.now() - clientTs;
        console.log(`\n⏱️  [T0] Dashboard -> Server Ingress: ${ingressLatency}ms`);

        if (text.startsWith('/')) {
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();
            if (cmd === '/model') {
                const arg = args[1];
                const MODEL_ID_MAP = {
                    '1': 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
                    '2': 'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
                    '3': '/Users/nelsonwong/Documents/projects/Prometheus/models/Qwen3.5-9B-Claude-Abliterated-mxfp4',
                    '4': 'mlx-community/Qwen2.5-Coder-14B-4bit'
                };
                const modelId = MODEL_ID_MAP[arg] || arg;

                if (!modelId) {
                    const helpMsg = `🧠 **Usage:** \`/model [1-4|name]\`\n\n**Presets:**\n1. Qwen 9B v2 (Reasoning)\n2. Qwen 4B v2 (Fast Reasoning)\n3. Qwen 9B (Abliterated)\n4. Coder 14B`;
                    socket.emit('message', { role: 'assistant', content: helpMsg });
                    return;
                }

                if (process.send) {
                    process.send({ type: 'RESTART_LLAMA', model: modelId });
                    socket.emit('message', { role: 'assistant', content: `🔄 Switching model to: **${modelId}**...` });
                }
                return;
            }
        }

        if (requestQueue.length >= MAX_QUEUE_SIZE) {
            socket.emit('message', { role: 'assistant', content: `⚠️ Queue is full.` });
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
                if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
                    socket.emit('status', '🔌 Model is sleeping. Waking up...');
                    if (process.send && process.connected) {
                        try { process.send({ type: 'RESTART_LLAMA' }); } catch(err) {}
                    }
                    setTimeout(() => {
                        requestQueue.unshift({ text, resolve, reject });
                        processQueue();
                    }, 20000);
                    return;
                }
                socket.emit('message', { role: 'assistant', content: `⚠️ Error: ${e.message}` });
            }
        });
    });

    socket.on('stop', () => {
        requestQueue.length = 0;
        agent.stop();
        socket.emit('status', 'Interrupted');
    });

    socket.on('skill_toggle', (data) => {
        const { name, enabled } = data;
        if (agent.skills.has(name)) {
            agent.toggleSkill(name, enabled);
            broadcastSkills();
        }
    });

    socket.on('update_config', (newConfig) => {
        userConfig = { ...userConfig, ...newConfig };
        if (newConfig.PROJECT_ROOT) process.env.PROJECT_ROOT = newConfig.PROJECT_ROOT;
        if (newConfig.DOCUMENTS_ROOT) process.env.DOCUMENTS_ROOT = newConfig.DOCUMENTS_ROOT;
        fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(userConfig, null, 2));
        io.emit('config_info', userConfig);
    });
 
    socket.on('refresh_resources', async () => {
        broadcastSkills(socket);
        broadcastKnowledge(socket);
        broadcastMemories(socket);
        broadcastTeamInfo(socket);
        await broadcastContext(socket);
    });

    socket.on('update_role_prompt', async (data) => {
        const { name, prompt } = data;
        try {
            const filePath = path.join(process.cwd(), 'prompts', `${name}.md`);
            if (fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, prompt, 'utf-8');
                socket.emit('log', `✅ Persona for **${name}** updated.`);
                broadcastTeamInfo();
            }
        } catch (e) {
            socket.emit('log', `❌ Failed: ${e.message}`);
        }
    });
  
    socket.on('set_mode', (mode) => {
        agent.setMode(mode);
        broadcastContext();
        socket.emit('log', `🎭 Active mode switched to **${mode}**.`);
    });

    socket.on('list_files', (data) => {
        const requestedPath = data?.path || '';
        let targetPath = path.isAbsolute(requestedPath) 
            ? requestedPath 
            : path.join(userConfig.PROJECT_ROOT, requestedPath);

        // Security check: Must be within PROJECT_ROOT or DOCUMENTS_ROOT
        const isWithinProject = targetPath.startsWith(userConfig.PROJECT_ROOT);
        const isWithinDocs = targetPath.startsWith(userConfig.DOCUMENTS_ROOT);

        if (!isWithinProject && !isWithinDocs) {
            socket.emit('log', `⚠️ Access denied: ${targetPath}`);
            return;
        }

        try {
            if (!fs.existsSync(targetPath)) {
                socket.emit('files_info', { path: requestedPath, files: [], error: 'Path does not exist' });
                return;
            }

            const stats = fs.statSync(targetPath);
            if (!stats.isDirectory()) {
                socket.emit('files_info', { path: requestedPath, files: [], error: 'Not a directory' });
                return;
            }

            const files = fs.readdirSync(targetPath).map(file => {
                const filePath = path.join(targetPath, file);
                try {
                    const s = fs.statSync(filePath);
                    return {
                        name: file,
                        isDir: s.isDirectory(),
                        size: s.size,
                        mtime: s.mtime
                    };
                } catch (e) {
                    return { name: file, error: 'Access denied' };
                }
            });

            socket.emit('files_info', { 
                path: requestedPath, 
                fullPath: targetPath,
                files: files.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name))
            });
        } catch (e) {
            socket.emit('log', `❌ Error listing files: ${e.message}`);
        }
    });

});

// Bind Agent Events to Socket.io
agent.on('message', (msg) => {
    io.emit('message', msg);
    broadcastContext();
});

agent.on('log', (content) => {
    if (content && String(content).trim()) {
        io.emit('log', content);
    }
});

agent.on('error', (err) => {
    const errorMsg = err instanceof Error ? err.message : String(err);
    io.emit('log', `🚨 [AGENT ERROR]: ${errorMsg}`);
});

agent.on('usage', (stats) => {
    io.emit('usage', stats);
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
        // Truncate result for log
        let resultSnippet = "";
        if (data.result) {
            const raw = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
            resultSnippet = raw.length > 200 ? raw.substring(0, 200) + "..." : raw;
        }
        io.emit('log', `✅ Tool finished: ${data.tool}\nResult: ${resultSnippet}`);
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
    io.emit('intent_trace', data);
});

// Start Server
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:3000';
const PORT = parseInt(new URL(PROMETHEUS_URL).port) || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Prometheus Dashboard: http://localhost:${PORT}`);
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
    console.log(`🌍 LAN Access: http://${localIp}:${PORT}`);
    console.log(`🧠 Agent loaded with ${agent.skills.size} skills.`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use.`);
        process.exit(1);
    } else {
        console.error(`\n❌ Server Error:`, err);
        process.exit(1);
    }
});
