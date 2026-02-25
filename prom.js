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
const CHECK_INTERVAL = 45000;
const HEALTH_TIMEOUT = 5000;
const STARTUP_SCRIPT = './scripts/start_llama.sh';

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

console.log(`${C.blue}🔥 Prometheus Launcher v1.0${C.reset}`);

const freeMB = getFreeMemMB();
if (freeMB < 1000) {
    console.log(`${C.red}⚠️  LOW MEMORY DETECTED: ${freeMB}M free. Prometheus may hang or respond slowly.${C.reset}`);

    const currentModel = process.env.LLM_MODEL || '';
    const isLight = currentModel.includes('3B') || currentModel.toLowerCase().includes('nanbeige');

    if (isLight) {
        console.log(`${C.yellow}💡 Recommendation: Close unnecessary apps (Chrome/Docker) to free up RAM.${C.reset}\n`);
    } else {
        console.log(`${C.yellow}💡 Recommendation: Close apps or switch to a lighter 3B model.${C.reset}\n`);
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
                resolve(res.ok);
            })
            .catch(() => {
                clearTimeout(timeoutId);
                resolve(false);
            });
    });
}

/**
 * Get the currently loaded models on port
 */
async function getLoadedModels() {
    try {
        const res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/models`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data || []).map(m => m.id);
    } catch {
        return [];
    }
}

// Track the server process globally so we can kill it
let serverProcess = null;

/**
 * Starts the Llama Server with an optional model
 */
function startLlamaServer(modelName) {
    console.log(`${C.yellow}⚠️  Starting Llama Server${modelName ? ' with ' + modelName : ''}...${C.reset}`);

    let pythonPath = process.env.PYTHON_PATH;

    // Auto-detect project venv if no explicit path is set
    if (!pythonPath) {
        const localVenv = path.join(process.cwd(), 'training_venv', 'bin', 'python3');
        if (existsSync(localVenv)) {
            pythonPath = localVenv;
        } else {
            pythonPath = 'python3';
        }
    }

    const model = modelName || process.env.LLM_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit';
    const logFile = createWriteStream('./logs/mlx_server.log', { flags: 'a' });

    console.log(`${C.dim}Environment: ${pythonPath}${C.reset}`);

    // Detect adapter
    let adapterArgs = [];
    const modelLow = model.toLowerCase();
    let adapterDir = null;

    if (modelLow.includes('nanbeige')) {
        adapterDir = path.join(process.cwd(), 'adapters', 'nanbeige-3b-backup');
    } else if (modelLow.includes('qwen3-8b')) {
        adapterDir = path.join(process.cwd(), 'adapters', 'qwen3-8b');
    }

    if (adapterDir && existsSync(adapterDir)) {
        console.log(`${C.green}✨ Loading adapters from: ${path.basename(adapterDir)}${C.reset}`);
        adapterArgs = ['--adapter-path', adapterDir];
    } else {
        console.log(`${C.yellow}ℹ️ No matching adapters found for ${model}, using base model.${C.reset}`);
    }

    serverProcess = spawn(pythonPath, ['-m', 'mlx_lm.server', '--model', model, '--port', LLAMA_PORT, '--trust-remote-code', ...adapterArgs], {
        stdio: 'pipe'
    });

    serverProcess.stdout.pipe(logFile);
    serverProcess.stderr.pipe(logFile);

    serverProcess.on('error', (err) => {
        logFile.write(`[ERROR] Failed to start process: ${err.message}\n`);
    });

}

/**
 * Kill any process using a specific port with proper monitoring and timeout
 */
async function killPort(port) {
    return new Promise((resolve) => {
        try {
            const pids = execSync(`lsof -ti:${port}`).toString().trim();
            if (pids) {
                console.log(`${C.red}💀 Killing processes on port ${port}: ${pids.split('\n').join(', ')}${C.reset}`);
                execSync(`kill -9 ${pids.split('\n').join(' ')}`);
            }
        } catch (e) {
            // No process found on port, which is fine
        }
        setTimeout(resolve, 500); // Give the OS half a second to release the port
    });
}

/**
 * Kill any process using the LLAMA_PORT
 */
async function killServer() {
    await killPort(LLAMA_PORT);
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

    // Backup sweeping catch for any stray mlx servers
    try {
        execSync('pkill -9 -f "mlx_lm.server"');
    } catch (e) { }

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

    // 1. Initial Health Check
    let availableModels = await getLoadedModels();
    const isCli = process.argv.includes('--cli');
    const DEFAULT_MODEL = process.env.LLM_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit';

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
        while (!healthy && attempts < 90) { // Increased wait for M1 with larger models
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

    // 2. Start the Interface (Web or CLI)
    const script = isCli ? 'channels/cli.js' : 'channels/web_server.js';
    const name = isCli ? 'Prometheus CLI' : 'Prometheus Web Server';

    console.log(`${C.blue}🚀 Launching ${name}...${C.reset}\n`);
    const proc = spawn('node', [script], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    global.uiProcess = proc; // Store globally for cleanup

    proc.on('message', async (msg) => {
        if (msg.type === 'SHUTDOWN') {
            console.log(`\n${C.yellow}🔄 Manager: Received manual shutdown request from CLI.${C.reset}`);
            // Force the cleanup immediately
            await cleanup();
            return;
        }
        if (msg.type === 'RESTART_LLAMA') {
            const available = await getLoadedModels();
            if (available.includes(msg.model)) {
                console.log(`${C.green}✅ Correct model ${msg.model} active. No action.${C.reset}`);
                return;
            }
            console.log(`\n${C.yellow}🔄 Manager: Received restart request for model: ${msg.model || 'default'}${C.reset}`);
            logGepEvent('repair', 'model_restart_requested', { model: msg.model });
            await killServer();
            startLlamaServer(msg.model);
        }
    });

    proc.on('close', async (code) => {
        console.log(`${C.dim}Prometheus child process exited with code ${code}${C.reset}`);
        await cleanup();
    });

    // 3. Periodic Health Watchdog
    setInterval(async () => {
        const isAlive = await checkServerHealth();
        if (!isAlive) {
            console.log(`\n${C.red}⚠️  Watchdog: Llama Server unresponsive! Restarting...${C.reset}`);
            logGepEvent('repair', 'server_unresponsive', { model: process.env.LLM_MODEL });
            await killServer();
            startLlamaServer();
        }
    }, CHECK_INTERVAL);

}

main();
