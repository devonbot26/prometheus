import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync, spawn } from 'child_process';
import 'dotenv/config';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.LLM_PORT || 18888;
const MODEL = process.env.LLM_MODEL || 'Jackrong/MLX-Qwopus3.5-9B-v3-4bit';
const LOGS_DIR = path.join(ROOT, 'logs');
const HEALTH_LOG = path.join(LOGS_DIR, 'health_history.json');
const IDENTITY_PATH = path.join(ROOT, 'prompts', 'physician.txt');

/**
 * PROMETHEUS PHYSICIAN (v5.3.1)
 * A zero-dependency recovery agent.
 */

class Physician {
    constructor() {
        this.history = this.loadHealthHistory();
        this.identity = fs.readFileSync(IDENTITY_PATH, 'utf-8');
        console.log('\n🚑 [PHYSICIAN] Waking up... Scanning patient context...');
    }

    loadHealthHistory() {
        if (fs.existsSync(HEALTH_LOG)) {
            try {
                return JSON.parse(fs.readFileSync(HEALTH_LOG, 'utf-8'));
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    saveHealthHistory() {
        fs.writeFileSync(HEALTH_LOG, JSON.stringify(this.history, null, 2));
    }

    /**
     * 🔬 BIOPSY: Extract the latest crash-moment logs
     */
    getDiagnosticContext() {
        const actionLog = path.join(LOGS_DIR, 'action-2026-04-05.log');
        const serverLog = path.join(ROOT, 'server.log');
        const historyJson = path.join(ROOT, 'core', 'history.json');

        const tail = (file, lines = 50) => {
            if (!fs.existsSync(file)) return `[ERROR] File missing: ${file}`;
            const content = fs.readFileSync(file, 'utf-8').split('\n');
            return content.slice(-lines).join('\n');
        };

        const ctx = [
            '--- LATEST ACTION LOG ---',
            tail(actionLog),
            '\n--- LATEST SERVER LOG ---',
            tail(serverLog),
            '\n--- LATEST CORE HISTORY (JSON) ---',
            tail(historyJson, 20)
        ].join('\n');

        return ctx;
    }

    /**
     * 🧠 INFERENCE: Independent LLM Bridge (OpenAI Schema)
     */
    async askBrain(prompt) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout

        const payload = {
            model: MODEL,
            messages: [
                { role: 'system', content: this.identity },
                { role: 'user', content: `DIAGNOSTIC DATA:\n${this.getDiagnosticContext()}\n\nCURRENT REQUEST:\n${prompt}` }
            ],
            temperature: 0.1,
            max_tokens: 1024,
            stream: false
        };

        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data = await res.json();
            return data.choices?.[0]?.message?.content || "";
        } catch (e) {
            if (e.name === 'AbortError') {
                console.error('⚠️ [BRAIN_TIMEOUT] MLX Server timed out (45s). Using Emergency Protocols.');
            } else {
                console.error(`⚠️ [BRAIN_DEAD] Error connecting to MLX: ${e.message}. Using Emergency Protocols.`);
            }
            return 'RESTART_SERVER_RECOVERY';
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * 🛠️ SURGERY: Atomic File Fix with Verification
     */
    surgicalFix(filePath, content) {
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
        const backupDir = path.join(ROOT, 'backups', 'physician', Date.now().toString());
        fs.mkdirSync(backupDir, { recursive: true });

        const backupPath = path.join(backupDir, path.basename(absPath));
        if (fs.existsSync(absPath)) fs.copyFileSync(absPath, backupPath);

        fs.writeFileSync(absPath, content);
        console.log(`🛡️ [PHYSICIAN] Applied patch to ${filePath}. Verifying syntax...`);

        try {
            execSync(`node --check ${absPath}`);
            console.log('✅ [PHYSICIAN] Syntax verification passed.');
            return true;
        } catch (e) {
            console.error('❌ [PHYSICIAN] PATCH FAILED SYNTAX CHECK. ROLLING BACK.');
            if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, absPath);
            return false;
        }
    }

    /**
     * ⚡ LIFE SUPPORT: Restart MLX Server
     */
    restartServer() {
        console.log('🔄 [PHYSICIAN] Triggering MLX Server Restart via start_llama.sh...');
        try {
            const pids = execSync(`lsof -ti:${PORT}`).toString().trim();
            if (pids) {
                console.log(`🧹 [PHYSICIAN] Clearing port ${PORT} (PIDs: ${pids.split('\n').join(', ')})...`);
                execSync(`kill -9 ${pids.split('\n').join(' ')}`);
            }
        } catch (e) {}

        const child = spawn(path.join(ROOT, 'scripts', 'start_llama.sh'), [], {
            cwd: ROOT,
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
        console.log('✅ [PHYSICIAN] Server restart detached. Memory clearing initiated.');
    }

    async runHealCycle() {
        try {
            const diagnosticCtx = this.getDiagnosticContext();
            let diagnosis = await this.askBrain("Analyze the logs. Is the system hung? If so, why? Propose a fix or restart.");
            
            if (!diagnosis || diagnosis.trim() === "" || diagnosis === 'RESTART_SERVER_RECOVERY') {
                console.log('🚑 [PHYSICIAN] Diagnosis: Critical Hardware/Brain Stoppage Detected.');
                console.log('🛠️ [PHYSICIAN] Action: Executing Emergency Hardware Recovery (Restart/Lock-Clear).');
                diagnosis = "Critical Stoppage. Brain was unresponsive. Performed Emergency Hardware Reset.";
                this.restartServer();
            } else {
                console.log(`🚑 [PHYSICIAN] Diagnosis:\n${diagnosis}`);
            }

            // Add to history
            this.history.push({ 
                timestamp: new Date().toISOString(), 
                diagnosis,
                context_snapshot: diagnosticCtx.slice(-500) // Keep a small record of the 'patient' state
            });
            this.saveHealthHistory();
        } catch (e) {
            console.error(`❌ [PHYSICIAN_CRASH] Unhandled error during heal cycle: ${e.message}`);
            process.exit(1);
        }
    }
}

const physician = new Physician();
physician.runHealCycle();
