import { logDebug } from './logger.js';

export const QUOTA_TIERS = {
    INTERACTIVE: 'interactive',
    AUTOMATED: 'automated'
};

class QuotaManager {
    constructor() {
        this.requests = [];
        this.safeModeUntil = null;
        this.automatedLimit = 5; // 5 requests per hour
        this.windowMs = 3600 * 1000;
        this.last429 = null;
    }

    /**
     * Check if a request is allowed based on tier and current usage
     * @param {string} tier 
     * @returns {boolean}
     */
    allow(tier = QUOTA_TIERS.INTERACTIVE) {
        const now = Date.now();

        // 1. Check Safe Mode (triggered by previous 429)
        if (this.safeModeUntil && now < this.safeModeUntil) {
            logDebug(`[QUOTA] Denied: Safe Mode active until ${new Date(this.safeModeUntil).toLocaleTimeString()}`);
            return false;
        }

        // 2. Interactive Tier: Always allowed (unless in Safe Mode)
        if (tier === QUOTA_TIERS.INTERACTIVE) {
            return true;
        }

        // 3. Automated Tier: Check sliding window
        this.prune(now);
        const automatedCount = this.requests.filter(r => r.tier === QUOTA_TIERS.AUTOMATED).length;

        if (automatedCount >= this.automatedLimit) {
            logDebug(`[QUOTA] Denied: Automated limit reached (${automatedCount}/${this.automatedLimit})`);
            return false;
        }

        return true;
    }

    /**
     * Record a successful request start
     * @param {string} tier 
     */
    recordRequest(tier) {
        this.requests.push({ timestamp: Date.now(), tier });
    }

    /**
     * Trigger Safe Mode when a 429 is encountered
     */
    triggerSafeMode() {
        const now = Date.now();
        this.last429 = now;
        this.safeModeUntil = now + (3600 * 1000); // 1 hour cool-down
        logDebug(`[QUOTA] 🚨 429 Detected. Entering Safe Mode for 1 hour.`);
    }

    prune(now) {
        this.requests = this.requests.filter(r => now - r.timestamp < this.windowMs);
    }

    getStatus() {
        const now = Date.now();
        this.prune(now);
        return {
            safeMode: this.safeModeUntil && now < this.safeModeUntil,
            safeModeRemaining: this.safeModeUntil ? Math.max(0, Math.floor((this.safeModeUntil - now) / 1000)) : 0,
            automatedCount: this.requests.filter(r => r.tier === QUOTA_TIERS.AUTOMATED).length,
            limit: this.automatedLimit
        };
    }
}

export const quotaManager = new QuotaManager();
