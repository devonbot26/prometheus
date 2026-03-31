import fs from 'fs';
import path from 'path';

const LOCK_FILE = path.join(process.cwd(), 'logs', 'llm.lock');
const LEASE_TTL_MS = 120000; // 120 seconds

/**
 * Acquire a lease-based lock for LLM access.
 * If a stale lock (>120s) exists, it is forcibly taken.
 */
export function acquireLock(owner = 'prometheus') {
    const logsDir = path.dirname(LOCK_FILE);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    if (fs.existsSync(LOCK_FILE)) {
        try {
            const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
            const age = Date.now() - lock.timestamp;
            if (age < LEASE_TTL_MS) {
                return false; // Lock is held and valid
            }
            console.log(`⚠️ [LLM_LOCK] Stale lock from ${lock.owner} (${(age/1000).toFixed(0)}s old). Force-acquiring.`);
        } catch (e) { 
            // Corrupt or unreadable lock file, safe to overwrite
        }
    }
    
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ 
        owner, 
        pid: process.pid, 
        timestamp: Date.now() 
    }));
    return true;
}

/**
 * Release the resource lock
 */
export function releaseLock() {
    try { 
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE); 
        }
    } catch (e) {
        // Log error but don't throw, release is best-effort
    }
}

/**
 * Helper to wrap a function call with the LLM lock
 */
export async function withLock(owner, fn) {
    let acquired = false;
    const maxRetries = 60; // 60 seconds
    
    for (let i = 0; i < maxRetries; i++) {
        acquired = acquireLock(owner);
        if (acquired) break;
        
        if (i > 0 && i % 5 === 0) {
            console.log(`⏳ [LLM_LOCK] ${owner} is waiting for hardware access (held for ${i}s)...`);
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!acquired) {
        throw new Error(`LLM_LOCK_TIMEOUT: Failed to acquire lock for ${owner} after ${maxRetries}s`);
    }

    try {
        return await fn();
    } finally {
        releaseLock();
    }
}
