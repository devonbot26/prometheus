import 'dotenv/config';
import { spawn, exec, execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { createWriteStream, existsSync, appendFileSync } from 'fs';
import { createInterface } from 'readline';
import fetch from 'node-fetch';

// Configuration
const LLAMA_PORT = 18888;
const WEB_PORT = 3000;
const CHECK_INTERVAL = 30000; // Reduced to 30s for faster memory response
const HEALTH_TIMEOUT = 300000;
const STARTUP_SCRIPT = './scripts/start_llama.sh';

const HEAVY_PORT = 18889;
let heavyServerProcess = null;
let heavyServerModel = null;

// ANSI Colors
const C = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    dim: "\x1b[2m"
};

// Utilities
function getFreeMemMB() {
    try {
        if (os.platform() === 'darwin') {
            const output = execSync('vm_stat').toString();
            const freeMatch = output.match(/Pages free:\s+(\d+)/);
            const inactiveMatch = output.match(/Pages inactive:\s+(\d+)/);
            const speculativeMatch = output.match(/Pages speculative:\s+(\d+)/);

            if (freeMatch && inactiveMatch) {
                const free = parseInt(freeMatch[1]);
                const inactive = parseInt(inactiveMatch[1]);
                const speculative = speculativeMatch ? parseInt(speculativeMatch[1]) : 0;
                const totalBytes = (free + inactive + speculative) * 16384;
                return Math.floor(totalBytes / (1024 * 1024));
            }
        }
    } catch (e) {
        // Fallback
    }
    return Math.floor(os.freemem() / (1024 * 1024));
}


// GEP Integration
const GEP_EVENTS_PATH = '/Users/nelsonwong/.config/evomap/assets/gep/events.jsonl';

function logGepEvent(intent, signal, details) {
    try {
        const event = {
            timestamp: new Date().toISOString(),
            source: 'prometheus-launcher',
            intent,
            signals: [signal],
            details
        };
        appendFileSync(GEP_EVENTS_PATH, JSON.stringify(event) + '\n');
    } catch (e) {
        console.error(`${C.red}⚠️ GEP Log Failed: ${e.message}${C.reset}`);
    }
}

/**
 * Persistently updates the LLM_MODEL in the .env file
 */
function updateEnvModel(modelId) {
    try {
        const envPath = path.join(process.cwd(), '.env');
        if (!existsSync(envPath)) return;
        
        let content = fs.readFileSync(envPath, 'utf8');
        if (content.includes('LLM_MODEL=')) {
            content = content.replace(/LLM_MODEL=.*(\r?\n|$)/, `LLM_MODEL=${modelId}$1`);
        } else {
            content += `\nLLM_MODEL=${modelId}\n`;
        }
        fs.writeFileSync(envPath, content);
        console.log(`${C.green}💾 Persisted new model preference to .env: ${modelId}${C.reset}`);
    } catch (e) {
        console.error(`${C.red}⚠️ Failed to update .env: ${e.message}${C.reset}`);
    }
}

console.log(`${C.blue}🔥 Prometheus Launcher v1.0${C.reset}`);

const freeMB = getFreeMemMB();
if (freeMB < 1000) {
    console.log(`${C.red}⚠️  LOW MEMORY DETECTED: ${freeMB}M free. Prometheus may hang or respond slowly.${C.reset}`);

    const currentModel = process.env.LLM_MODEL || '';
    const isHeavy = currentModel.includes('9B') || currentModel.includes('7B');

    if (isHeavy) {
        console.log(`${C.yellow}💡 Recommendation: Close unnecessary apps (Chrome/Docker) to free up RAM.${C.reset}\n`);
    } else {
        console.log(`${C.yellow}💡 Recommendation: Using ${currentModel.includes('2B') ? 'Ultra-Fast 2B' : 'Qwen3.5 9B'} for optimal local performance.${C.reset}\n`);
    }
}

/**
 * Checks if the Llama server is healthy by pinging /v1/models
 */
function checkServerHealth() {
    return new Promise((resolve) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

        fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/models`, { signal: controller.signal })
            .then(res => {
                clearTimeout(timeoutId);
                if (res.ok) resolve(true);
                else {
                    fetch(`http://127.0.0.1:${LLAMA_PORT}/models`).then(r => {
                        if (r.ok) resolve(true);
                        else fetch(`http://127.0.0.1:${LLAMA_PORT}/health`).then(r2 => resolve(r2.ok)).catch(() => resolve(false));
                    }).then(res2 => resolve(res2)).catch(() => resolve(false));
                }
            })
            .catch(() => {
                clearTimeout(timeoutId);
                fetch(`http://127.0.0.1:${LLAMA_PORT}/health`).then(r => resolve(r.ok)).catch(() => resolve(false));
            });
    });
}

/**
 * Get the currently loaded models on port
 */
async function getLoadedModels() {
    try {
        let res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/models`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) {
            // VLM fallback
            res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/models`, { signal: AbortSignal.timeout(2000) });
        }
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data || []).map(m => m.id);
    } catch {
        return [];
    }
}

// Track the server process globally so we can kill it
let serverProcess = null;
let isRestarting = false;

// MLX Lifecycle State
let currentMlxState = 'offline'; 
const broadcastState = (state, model) => {
    currentMlxState = state;
    if (global.uiProcess && global.uiProcess.connected) {
        global.uiProcess.send({ 
            type: 'MODEL_STATE_CHANGE', 
            state, 
            model: model || process.env.LLM_MODEL || 'default'
        });
    }
};


/**
 * Starts the Llama Server with an optional model
 */
function startLlamaServer(modelName) {
    console.log(`${C.yellow}⚠️  Starting Llama Server${modelName ? ' with ' + modelName : ''}...${C.reset}`);

    // Priority: 1. System Python (Homebrew), 2. Explicit Env, 3. Local Venv
    let pythonPath = process.env.PYTHON_PATH;
    const homebrewPython = '/opt/homebrew/bin/python3';

    if (!pythonPath && existsSync(homebrewPython)) {
        pythonPath = homebrewPython;
    }

    if (!pythonPath) {
        const localVenv = path.join(process.cwd(), 'training_venv', 'bin', 'python3');
        if (existsSync(localVenv)) {
            pythonPath = localVenv;
        } else {
            pythonPath = 'python3';
        }
    }

    const model = modelName || process.env.LLM_MODEL || 'mlx-community/Qwen3.5-2B-4bit';
    const logFile = createWriteStream('./logs/mlx_server.log', { flags: 'a' });

    console.log(`${C.dim}Environment: ${pythonPath}${C.reset}`);

    // Detect adapter
    let adapterArgs = [];
    const modelLow = model.toLowerCase();
    let adapterDir = null;

    if (modelLow.includes('qwen3.5-9b')) {
        adapterDir = path.join(process.cwd(), 'adapters', 'qwen3.5-9b');
    }

    if (adapterDir && existsSync(adapterDir)) {
        console.log(`${C.green}✨ Loading adapters from: ${path.basename(adapterDir)}${C.reset}`);
        adapterArgs = ['--adapter-path', adapterDir];
    } else {
        console.log(`${C.yellow}ℹ️ No matching adapters found for ${model}, using base model.${C.reset}`);
    }

    // Use the optimized shell script for startup if it exists
    if (existsSync(STARTUP_SCRIPT)) {
        console.log(`${C.green}✨ Using startup script: ${STARTUP_SCRIPT}${C.reset}`);
        serverProcess = spawn('bash', [STARTUP_SCRIPT, model, process.env.DRAFT_MODEL || ''], {
            stdio: 'pipe',
            detached: true, // Group processes for clean shutdown
            env: { ...process.env, PORT: LLAMA_PORT }
        });
    } else {
        // Fallback to manual spawn if script missing
        console.log(`${C.dim}Executing manual spawn: ${pythonPath}${C.reset}`);
        serverProcess = spawn(pythonPath, ['-m', 'mlx_lm', 'server', '--model', model, '--port', LLAMA_PORT, '--trust-remote-code', ...adapterArgs], {
            stdio: 'pipe',
            detached: true // Group processes for clean shutdown
        });
    }

    serverProcess.stdout.pipe(logFile);
    serverProcess.stderr.pipe(logFile);

    serverProcess.on('error', (err) => {
        logFile.write(`[ERROR] Failed to start process: ${err.message}\n`);
    });

    // Fix 3: Track MLX process exit to clear stale PID and update state
    serverProcess.on('close', (code, signal) => {
        console.log(`${C.yellow}⚠️  MLX Server process exited (code=${code}, signal=${signal})${C.reset}`);
        if (!isCleaningUp && !isRestarting) {
            broadcastState('offline');
        }
        serverProcess = null;
    });

}

/**
 * Starts the Heavy Llama Server on port 18889
 */
function startHeavyServer(modelName) {
    const model = modelName || process.env.LLM_MODEL_HEAVY || 'Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit';
    console.log(`${C.magenta}🚀 Starting Heavy Llama Server on port ${HEAVY_PORT} with ${model}...${C.reset}`);

    const logFile = createWriteStream('./logs/mlx_heavy.log', { flags: 'a' });

    if (existsSync(STARTUP_SCRIPT)) {
        heavyServerProcess = spawn('bash', [STARTUP_SCRIPT, model], {
            stdio: 'pipe',
            detached: true,
            env: { ...process.env, PORT: HEAVY_PORT }
        });
    } else {
        const pythonPath = 'python3';
        heavyServerProcess = spawn(pythonPath, ['-m', 'mlx_lm', 'server', '--model', model, '--port', HEAVY_PORT, '--trust-remote-code'], {
            stdio: 'pipe',
            detached: true
        });
    }

    heavyServerProcess.stdout.pipe(logFile);
    heavyServerProcess.stderr.pipe(logFile);

    heavyServerProcess.on('close', (code, signal) => {
        console.log(`${C.magenta}⚠️  Heavy LLM Server exited (code=${code}, signal=${signal})${C.reset}`);
        heavyServerProcess = null;
        heavyServerModel = null;
    });

    heavyServerModel = model;
}

/**
 * Kill any process using a specific port with proper monitoring and timeout
 */
async function killPort(port) {
    try {
        const pids = execSync(`lsof -ti:${port} -sTCP:LISTEN`).toString().trim();

        if (pids) {
            console.log(`${C.red}💀 Killing processes on port ${port}: ${pids.split('\n').join(', ')}${C.reset}`);
            execSync(`kill -9 ${pids.split('\n').join(' ')}`);
        }
    } catch (e) {
        // No process found on port
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s for OS to release port
}

/**
 * Kill any process using the LLAMA_PORT (Fix 4: strengthened with process tree kill)
 */
async function killServer() {
    // 1. Kill by port (existing behavior)
    await killPort(LLAMA_PORT);

    // 2. Kill by process group (catches child workers)
    if (serverProcess && serverProcess.pid) {
        try {
            process.kill(-serverProcess.pid, 'SIGKILL');
            console.log(`${C.red}💀 Killed MLX process group: -${serverProcess.pid}${C.reset}`);
        } catch (e) { /* already dead */ }
        serverProcess = null;
    }

    // 3. Sweep any surviving MLX/Uvicorn processes by name
    try { execSync('pkill -9 -f "mlx_vlm.server"'); } catch (e) {}
    try { execSync('pkill -9 -f "mlx_lm"'); } catch (e) {}
    try { execSync('pkill -9 -f "uvicorn.*18888"'); } catch (e) {}

    // 4. Wait for OS to release port (increased from 1s)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. Cleanup heavy server as well on full shutdown
    if (heavyServerProcess) {
        await killPort(HEAVY_PORT);
        if (heavyServerProcess.pid) {
            try { process.kill(-heavyServerProcess.pid, 'SIGKILL'); } catch (e) {}
        }
    }
}

/**
 * Cleanup on Exit
 */
let isCleaningUp = false;
const cleanup = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    console.log(`\n${C.yellow}🛑 Shutting down Prometheus...${C.reset}`);

    // 1. Kill the MLX server FIRST and wait for it to finish dying
    await killServer();

    // 2. Kill the UI Channel process if it exists
    if (global.uiProcess && global.uiProcess.pid) {
        try {
            console.log(`${C.red}💀 Terminating UI Channel (PID: ${global.uiProcess.pid})${C.reset}`);
            process.kill(global.uiProcess.pid, 'SIGKILL');
        } catch (e) { }
    }

    // 3. Absolute Fallbacks for Zombies
    try {
        const pids = execSync(`lsof -ti:${WEB_PORT}`).toString().trim();
        if (pids) {
            execSync(`kill -9 ${pids.split('\n').join(' ')}`);
        }
    } catch (e) { }

    try {
        console.log(`${C.dim}🧹 Sweeping orphaned MCP server processes...${C.reset}`);
        execSync(`pkill -f mcp-server`);
    } catch (e) { }

    // Targeted sweep for our specific Llama Server process group
    if (serverProcess && serverProcess.pid) {
        console.log(`${C.red}💀 Terminating Llama Process Group (PID: -${serverProcess.pid})${C.reset}`);
        try {
            process.kill(-serverProcess.pid, 'SIGKILL');
        } catch (e) { }
    }

    console.log(`${C.green}✅ Shutdown complete.${C.reset}`);
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Main Loop
 */
async function main() {
    // 0. Clean up Web Port causing EADDRINUSE
    await killPort(WEB_PORT);

    // 0.1 Archive old error logs to keep workspace clean
    try {
        console.log(`${C.dim}🧹 Archiving old error logs...${C.reset}`);
        execSync(`node scripts/log_archive.js`, { stdio: 'inherit' });
    } catch (e) {
        console.error(`${C.red}⚠️ Log archiving failed: ${e.message}${C.reset}`);
    }

    // 1. Initial Health Check
    let availableModels = await getLoadedModels();
    const isCli = process.argv.includes('--cli');
    const DEFAULT_MODEL = process.env.LLM_MODEL || 'mlx-community/Qwen3.5-2B-4bit';

    // Retry once if availableModels is empty (server might be warming up)
    if (availableModels.length === 0) {
        process.stdout.write(`${C.dim}Checking existing server status...${C.reset}`);
        await new Promise(r => setTimeout(r, 2000));
        availableModels = await getLoadedModels();
        console.log("");
    }

    const isRunningDefault = availableModels.includes(DEFAULT_MODEL);

    if (isRunningDefault) {
        console.log(`${C.green}✅ Model ${DEFAULT_MODEL} already online, skipping restart.${C.reset}`);
    } else {
        if (availableModels.length > 0) {
            console.log(`${C.yellow}🔄 Model mismatch (active: ${availableModels.join(', ')}), restarting to ${DEFAULT_MODEL}...${C.reset}`);
        } else {
            console.log(`${C.yellow}📡 No active server detected, starting...${C.reset}`);
        }
        await killServer();
        startLlamaServer(DEFAULT_MODEL);

        // Wait for it to come up
        process.stdout.write(`${C.dim}Waiting for server to be ready...${C.reset}`);
        let healthy = false;
        let attempts = 0;
        const maxAttempts = (DEFAULT_MODEL.toLowerCase().includes('vl') || DEFAULT_MODEL.toLowerCase().includes('9b') || DEFAULT_MODEL.toLowerCase().includes('14b')) ? 300 : 120; // 300s for heavy/VL models
        while (!healthy && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            healthy = await checkServerHealth();
            if (!healthy) process.stdout.write('.');
            attempts++;
        }
        console.log("");

        if (!healthy) {
            console.error(`${C.red}❌ Failed to start Llama Server. Check Python/MLX installation.${C.reset}`);
            process.exit(1);
        }
    }

    console.log(`${C.green}✅ Llama Server is online on port ${LLAMA_PORT}${C.reset}`);

    // Activity tracking for idle unload
    const minutesEnv = process.env.IDLE_UNLOAD_MINUTES;
    const IDLE_TIMEOUT = (minutesEnv !== undefined && parseInt(minutesEnv) === 0) 
        ? Infinity 
        : (minutesEnv ? parseInt(minutesEnv) * 60000 : 900000); // Default 15 mins
    let lastActivityTime = Date.now();

    // 2. Start the Interface (Web or CLI)
    const startUI = () => {
        const script = isCli ? 'channels/cli.js' : 'channels/web_server.js';
        const name = isCli ? 'Prometheus CLI' : 'Prometheus Web Server';

        console.log(`${C.blue}🚀 Launching ${name}...${C.reset}\n`);
        const args = ['--max-old-space-size=1024', script];
        if (isCli) args.push(...process.argv.slice(3));
        const proc = spawn('node', args, { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
        global.uiProcess = proc;

        proc.on('message', async (msg) => {
            lastActivityTime = Date.now();
            // Memory management for 2B server based on UI process messages
            const freeMB = getFreeMemMB();
            if (freeMB < 3000 && serverProcess && !isRestarting) {
                console.error(`${C.red}⚠️  LOW MEMORY DETECTED (${freeMB}MB). Offloading 2B Llama Server to free resources.${C.reset}`);
                await killServer(); // Ensure killServer is awaited
                broadcastState('offloaded');
                logGepEvent('memory_offload', 'LOW_RAM_UI_MSG', { free_mb: freeMB, action: 'offload_2b' });
                return; // Stop processing other messages if offloading
            } else if (freeMB > 6000 && !serverProcess && !isRestarting) {
                console.log(`${C.green}✅ Memory recovered (${freeMB}MB). Relaunching 2B Llama Server.${C.reset}`);
                startLlamaServer(process.env.LLM_MODEL || 'mlx-community/Qwen3.5-2B-MLX-4bit');
                return; // Stop processing other messages if relaunching
            }

            if (msg.type === 'SHUTDOWN') {
                console.log(`\n${C.yellow}🔄 Manager: Received manual shutdown request from CLI.${C.reset}`);
                await cleanup();
                return;
            }

            if (msg.type === 'STOP_LLAMA') {
                console.log(`\n${C.yellow}🔄 Manager: Received manual stop request for MLX server.${C.reset}`);
                await killServer();
                broadcastState('offline');
                return;
            }

            if (msg.type === 'START_HEAVY_SERVER') {
                if (!heavyServerProcess) {
                    startHeavyServer(msg.model);
                } else if (heavyServerModel !== msg.model) {
                    console.log(`${C.magenta}🔄 Swapping heavy server model to: ${msg.model}${C.reset}`);
                    killPort(HEAVY_PORT).then(() => {
                        startHeavyServer(msg.model);
                    });
                }
            }
            if (msg.type === 'RESTART_LLAMA') {
                if (isRestarting && !msg.forceClean) return;
                isRestarting = true;
                try {
                    const available = await getLoadedModels();
                    if (available.includes(msg.model) && !msg.forceClean) {
                        console.log(`${C.green}✅ Correct model ${msg.model} active. No action.${C.reset}`);
                        isRestarting = false;
                        broadcastState('online', msg.model);
                        return;
                    }
                    console.log(`\n${C.yellow}🔄 Manager: Received restart request for model: ${msg.model || 'default'}${C.reset}`);
                    console.log(`${C.dim}📡 Available: ${available.join(', ')}${C.reset}`);
                    logGepEvent('repair', 'model_restart_requested', { model: msg.model });
                    
                    broadcastState('spawning', msg.model);
                    await killServer();

                    // Fix 5: Verify port is free before spawning new server
                    let portFree = false;
                    for (let i = 0; i < 10; i++) {
                        try {
                            execSync(`lsof -ti:${LLAMA_PORT} -sTCP:LISTEN`);
                            console.log(`${C.dim}Port ${LLAMA_PORT} still occupied, waiting... (${i+1}/10)${C.reset}`);
                            await new Promise(r => setTimeout(r, 500));
                        } catch (e) {
                            portFree = true;
                            break;
                        }
                    }
                    if (!portFree) {
                        console.error(`${C.red}⚠️ Port still occupied after kill. Force-killing all.${C.reset}`);
                        try { execSync(`kill -9 $(lsof -ti:${LLAMA_PORT})`); } catch (e) {}
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    startLlamaServer(msg.model);
                    
                    const checkHealthy = async () => {
                        const h = await checkServerHealth();
                        if (h) {
                            process.env.LLM_MODEL = msg.model; // Update supervisor state
                            updateEnvModel(msg.model); // Update .env for persistence
                            if (global.uiProcess && global.uiProcess.connected) {
                                global.uiProcess.send({ type: 'MODEL_UPDATED', model: msg.model });
                            }
                            broadcastState('online', msg.model);
                            isRestarting = false;
                        } else {
                            setTimeout(checkHealthy, 2000);
                        }
                    };
                    checkHealthy();
                } catch (e) {
                    isRestarting = false;
                    broadcastState('offline');
                }
            }

        });

        let crashCount = 0;
        let lastCrashTime = 0;

        proc.on('close', async (code, signal) => {
            console.log(`${C.dim}Prometheus child process exited with code ${code} and signal ${signal}${C.reset}`);
            
            // If the launcher is already cleaning up, don't try to restart
            if (isCleaningUp) return;

            // Auto-Restart Logic (Supervisor Pattern)
            const now = Date.now();
            if (now - lastCrashTime < 60000) crashCount++;
            else crashCount = 1;
            lastCrashTime = now;

            if (crashCount >= 5) { // Increased tolerance
                console.log(`${C.red}💀 Rapid crash loop detected (${crashCount} crashes in <60s). Shutting down ecosystem.${C.reset}`);
                await cleanup();
                return;
            }

            // A crash is defined as:
            // 1. A non-zero exit code
            // 2. A null code + a present signal (e.g. SIGKILL, SIGSEGV)
            // 3. A null code + null signal (often indicates an abrupt termination or OOM)
            const isCrash = (code !== 0 && code !== null) || (code === null);

            if (isCrash) {
                console.log(`${C.yellow}🔄 Supervisor: Node process crashed or was killed by signal ${signal}. Respawning ${name} in 3s... (Crash ${crashCount}/5)${C.reset}`);
                setTimeout(startUI, 3000);
            } else {
                // Normal exit (e.g. CTRL+C in CLI handled by child or process.exit(0))
                console.log(`${C.dim}Supervisor: Normal exit detected. Cleaning up...${C.reset}`);
                await cleanup();
            }
        });
    };

    startUI();

    // 3. Periodic Health Watchdog
    let lastHealthyTime = Date.now();
    setInterval(async () => {
        const isHealthy = await checkServerHealth();
    const freeMB = getFreeMemMB();

    // 1. Memory Pressure Offload (below 3GB)
    if (freeMB < 3000 && serverProcess && !isRestarting) {
        console.log(`${C.red}⚠️  CRITICAL MEMORY: ${freeMB}MB free. Offloading 2B server to prevent system swap.${C.reset}`);
        broadcastState('offloaded');
        await killServer();
        // Log event for audit
        logGepEvent('memory_offload', 'LOW_RAM', { free_mb: freeMB, action: 'offload_2b' });
    }

    // 2. Memory Recovery Auto-Start (above 6GB)
    if (freeMB > 6000 && !serverProcess && !isRestarting) {
        console.log(`${C.green}✅ MEMORY RECOVERED: ${freeMB}MB free. Resuming 2B server.${C.reset}`);
        startLlamaServer();
    }

    if (isHealthy) {
            lastHealthyTime = Date.now();
            if (currentMlxState !== 'online') {
                broadcastState('online');
            }
        } else {
            // Unhealthy check
            if (currentMlxState === 'online' && !isRestarting) {
                broadcastState('offline');
            }
            
            const unresponsiveTooLong = (Date.now() - lastHealthyTime) > HEALTH_TIMEOUT;
            const hadRecentActivity = (Date.now() - lastActivityTime) < IDLE_TIMEOUT;

            if (unresponsiveTooLong && hadRecentActivity) {
                console.log(`\n${C.red}⚠️  Watchdog: Llama Server unresponsive for >${HEALTH_TIMEOUT / 1000}s! Restarting...${C.reset}`);
                logGepEvent('repair', 'server_unresponsive', { model: process.env.LLM_MODEL, duration_s: (Date.now() - lastHealthyTime) / 1000 });
                await killServer();
                lastHealthyTime = Date.now(); // Reset counter for reboot
                broadcastState('spawning');
                startLlamaServer();
            }
        }

        // Idle Unload Logic
        const idleTime = Date.now() - lastActivityTime;
        if (idleTime > IDLE_TIMEOUT) {
            console.log(`\n${C.magenta}💤 Idle Timeout (${Math.floor(idleTime / 60000)}m). Unloading model to release RAM...${C.reset}`);
            logGepEvent('resource', 'idle_unload', { idle_minutes: Math.floor(idleTime / 60000) });
            await killServer();
            broadcastState('offline');
            if (global.uiProcess && global.uiProcess.connected) {
                global.uiProcess.send({ type: 'MODEL_SLEEPING' });
            }

        }
    }, CHECK_INTERVAL);

}

main();
