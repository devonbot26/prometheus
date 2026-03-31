import fs from 'fs';
import path from 'path';

/**
 * SelfReflection Service
 * Orchestrates background audits and manages the "Morning Briefing" feature.
 */
export class SelfReflection {
    constructor(agent, io) {
        this.agent = agent;
        this.io = io;
        this.interval = 12 * 60 * 60 * 1000; // 12 hours
        this.timer = null;
        this.stateFile = path.join(process.cwd(), 'logs', 'report_state.json');
    }

    start() {
        console.log('🤖 Self-Reflection service active (interval: 12h)');
        // Initial reflection after 1 minute
        setTimeout(() => this.reflect(), 60000);
        // Periodic reflection
        this.timer = setInterval(() => this.reflect(), this.interval);

        // Morning Briefing Check (every hour)
        setInterval(() => this.checkMorningBriefing(), 3600000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    /**
     * Placeholder for the Morning Briefing feature.
     * Prevents "this.checkMorningBriefing is not a function" crash.
     */
    async checkMorningBriefing() {
        try {
            const now = new Date();
            // Only run between 7am and 9am
            if (now.getHours() < 7 || now.getHours() > 9) return;

            const lastRunFile = path.join(process.cwd(), 'logs', 'last_morning_briefing.txt');
            const todayStr = now.toISOString().split('T')[0];

            if (fs.existsSync(lastRunFile)) {
                const lastRun = fs.readFileSync(lastRunFile, 'utf8').trim();
                if (lastRun === todayStr) return;
            }

            console.log('🌅 [MORNING BRIEFING] Generating automated start-of-day report...');
            // For now, just log and mark as run to avoid loop
            fs.writeFileSync(lastRunFile, todayStr);
            
            // In the future, this can trigger a specialized agent turn to summarize 
            // missed events (emails, system health) and present to the user.
        } catch (e) {
            console.error('🌅 [MORNING BRIEFING] Error:', e.message);
        }
    }

    async reflect() {
        try {
            if (this.agent.processing) {
                console.log('🤖 [REFLECTION] Agent is busy. Postponing audit.');
                return;
            }

            const coreFiles = ['core/agent.js', 'core/llm.js', 'channels/web_server.js'];
            for (const file of coreFiles) {
                const { analyze_code_complexity } = await import('../skills/self-improvement/index.js');
                const analysis = await analyze_code_complexity({ file_path: file });
                if (analysis.includes('🚨') || analysis.includes('⚠️')) {
                    console.log(`🤖 [REFLECTION] Complexity warning for ${file}`);
                    // We don't spam the UI with every complexity hit, just log it internally
                }
            }

        } catch (e) {
            console.error('🤖 [REFLECTION] Error during self-audit:', e.message);
        }
    }
}
