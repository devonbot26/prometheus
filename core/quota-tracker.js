import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUOTA_PATH = path.join(__dirname, '../config/quota.json');

const DEFAULT_QUOTA = {
    dailyLimit: 200000, // Default 200k tokens
    used: 0,
    lastReset: new Date().toISOString()
};

class QuotaTracker {
    constructor() {
        this.data = this.load();
        this.checkReset();
    }

    load() {
        try {
            if (fs.existsSync(QUOTA_PATH)) {
                return JSON.parse(fs.readFileSync(QUOTA_PATH, 'utf-8'));
            }
        } catch (e) {
            console.error('⚠️ Failed to load quota:', e.message);
        }
        return { ...DEFAULT_QUOTA };
    }

    save() {
        try {
            fs.writeFileSync(QUOTA_PATH, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('⚠️ Failed to save quota:', e.message);
        }
    }

    checkReset() {
        const now = new Date();
        const lastReset = new Date(this.data.lastReset);

        // Reset if it's a new day
        if (now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
            this.data.used = 0;
            this.data.lastReset = now.toISOString();
            this.save();
        }
    }

    deduct(tokens) {
        this.checkReset();
        this.data.used += tokens;
        this.save();
    }

    getStats() {
        this.checkReset();
        const remaining = Math.max(0, this.data.dailyLimit - this.data.used);
        const percent = (remaining / this.data.dailyLimit) * 100;

        // Calculate refresh time (next midnight)
        const nextReset = new Date();
        nextReset.setHours(24, 0, 0, 0);
        const msUntilReset = nextReset - new Date();

        return {
            used: this.data.used,
            limit: this.data.dailyLimit,
            remaining,
            percent: parseFloat(percent.toFixed(1)),
            msUntilReset
        };
    }
}

export const quotaTracker = new QuotaTracker();
