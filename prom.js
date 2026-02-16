import { spawn, exec } from 'child_process';
import { createInterface } from 'readline';

// Configuration
const LLAMA_PORT = 18888;
const CHECK_INTERVAL = 30000; // Check health every 30s
const HEALTH_TIMEOUT = 5000; // Wait 5s for health check response
const STARTUP_SCRIPT = '/Users/devonwong/Documents/Projects/Project02_Llama/start_server.sh';

// ANSI Colors
const C = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    blue: "\x1b[34m",
    dim: "\x1b[2m"
};

console.log(`${C.blue}🔥 Prometheus Launcher v1.0${C.reset}`);

/**
 * Checks if the Llama server is healthy by pinging /health
 */
function checkServerHealth() {
    return new Promise((resolve) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

        fetch(`http://127.0.0.1:${LLAMA_PORT}/health`, { signal: controller.signal })
            .then(res => {
                clearTimeout(timeoutId);
                if (res.ok) resolve(true);
                else resolve(false);
            })
            .catch(() => {
                clearTimeout(timeoutId);
                resolve(false);
            });
    });
}

/**
 * Starts the Llama Server using the existing bash script
 */
function startLlamaServer() {
    console.log(`${C.yellow}⚠️  Llama Server not detected (or unresponsive). Starting it...${C.reset}`);

    const serverProcess = spawn(STARTUP_SCRIPT, [], {
        detached: true,
        stdio: 'ignore' // We rely on the script's internal logging
    });

    serverProcess.unref();
}

/**
 * Kill any process using the LLAMA_PORT
 */
async function killServer() {
    return new Promise((resolve) => {
        exec(`lsof -ti:${LLAMA_PORT} | xargs kill -9`, (err) => {
            if (!err) console.log(`${C.red}💀 Killed unresponsive server on port ${LLAMA_PORT}${C.reset}`);
            resolve();
        });
    });
}

/**
 * Main Loop
 */
async function main() {
    // 1. Initial Health Check
    let healthy = await checkServerHealth();

    if (!healthy) {
        // Try to verify if port is technically open but just 404ing (which is fine for some servers)
        // or if connection refused (dead).
        // For simplicity: If health check fails, we assume dead or broken.
        await killServer(); // Just in case it's a zombie process
        startLlamaServer();

        // Wait for it to come up
        process.stdout.write(`${C.dim}Waiting for server to be ready...${C.reset}`);
        let attempts = 0;
        while (!healthy && attempts < 30) {
            await new Promise(r => setTimeout(r, 1000));
            healthy = await checkServerHealth();
            if (!healthy) process.stdout.write('.');
            attempts++;
        }
        console.log(""); // Newline

        if (!healthy) {
            console.error(`${C.red}❌ Failed to start Llama Server. Check logs.${C.reset}`);
            process.exit(1);
        }
    }

    console.log(`${C.green}✅ Llama Server is online on port ${LLAMA_PORT}${C.reset}`);

    // 2. Start the CLI
    console.log(`${C.blue}🚀 Launching Prometheus CLI...${C.reset}\n`);
    const cli = spawn('node', ['channels/cli.js'], { stdio: 'inherit' });

    cli.on('close', (code) => {
        console.log(`${C.dim}Prometheus exited with code ${code}${C.reset}`);
        process.exit(code);
    });

    // 3. Periodic Health Watchdog
    setInterval(async () => {
        const isAlive = await checkServerHealth();
        if (!isAlive) {
            console.log(`\n${C.red}⚠️  Watchdog: Llama Server unresponsive! Restarting...${C.reset}`);
            await killServer();
            startLlamaServer();
            // We don't restart the CLI here, hoping it recovers connection on next turn
        }
    }, CHECK_INTERVAL);
}

main();
