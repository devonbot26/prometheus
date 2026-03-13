import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { logDebug } from './logger.js';
import { memoryManager } from './memory-manager.js';

/**
 * Initializes all background Cron Jobs for Prometheus
 * @param {Agent} agent - The main agent instance to inject prompts into
 * @param {Function} printFn - Callback strictly to print output to the active channel
 */
export function initCronJobs(agent, printFn) {
    if (!agent) {
        throw new Error("Cannot init cron jobs without an initialized Agent.");
    }

    logDebug('[DEBUG] Initializing Scheduled Cron Jobs...');

    // Job 1: Morning Briefing at 8:00 AM every day
    cron.schedule('0 8 * * *', async () => {
        try {
            printFn("\n[BACKGROUND TASK STARTED: Morning Briefing]\n");
            const prompt = "[SYSTEM] Good morning. Please use the get_weather tool to fetch the weather in your configured location, and then use any calendar tools or email tools to check my agenda. Finally, print a helpful morning briefing for me.";
            const response = await agent.process(prompt);
            printFn(`\n☀️ Morning Briefing: ${response.text}\n`);
        } catch (e) {
            printFn(`\n❌ Background Task failed: ${e.message}\n`);
        }
    });

    // Job 2: Memory Summarization at 3:00 AM every day
    cron.schedule('0 3 * * *', async () => {
        runMemorySummarizer(agent, printFn);
    });

    // Boot Recovery Check: Ensure yesterday's logs were summarized
    checkBootRecovery(agent, printFn);

    // Test Job: Run every minute to verify functionality
    /*
    cron.schedule('* * * * *', async () => {
        try {
            printFn("\n[TEST CRON JOB WAKEUP]\n");
            const prompt = "[SYSTEM] This is an automated test. Please use the get_weather tool to quickly fetch the weather in New York and output a 1-sentence summary.";

            const response = await agent.process(prompt);
            printFn(`\n⚡️ Test Result: ${response.text}\n`);
        } catch (e) {
            printFn(`\n❌ Test Task failed: ${e.message}\n`);
        }
    });
    */

    logDebug('[DEBUG] Cron jobs scheduled.');
}

/**
 * Runs the memory summarizer with a busy-check retry loop.
 */
async function runMemorySummarizer(agent, printFn, retries = 0) {
    if (agent.processing) {
        if (retries < 3) {
            logDebug(`[CRON] Agent is busy. Retrying memory archive in 30 minutes... (Attempt ${retries + 1})`);
            setTimeout(() => runMemorySummarizer(agent, printFn, retries + 1), 30 * 60 * 1000);
            return;
        } else {
            printFn("\n⚠️ [CRON] Agent stayed busy for 1.5 hours. Skipping memory archive for today.\n");
            return;
        }
    }

    try {
        printFn("\n[BACKGROUND TASK STARTED: Memory Archiver]\n");
        
        // 1. Determine yesterday's log file
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yyyymmdd = yesterday.toISOString().split('T')[0];
        const logPath = path.join(process.cwd(), 'logs', `action-${yyyymmdd}.log`);

        if (!fs.existsSync(logPath)) {
            printFn(`\n⚠️ [CRON] No log file found for yesterday (${yyyymmdd}). Skipping.\n`);
            return;
        }

        const logData = fs.readFileSync(logPath, 'utf8');
        if (!logData.trim()) {
            printFn(`\n⚠️ [CRON] Yesterday's log is empty. Skipping.\n`);
            return;
        }

        // 2. Pass to 9B model for summarization
        const summaryPrompt = `[SYSTEM] You are the Memory Archivist. Below are raw action logs from yesterday. 
Extract only the key user decisions, architectural choices, and significant project goals. 
IGNORE routine file edits or terminal commands unless they represent a major decision.
OUTPUT format: A strict JSON array of objects with fields: "topic", "fact", "tags" (string array).
Example: [{"topic": "Style", "fact": "User prefers Vanilla CSS", "tags": ["css", "ui"]}]

LOG DATA:
${logData}`;

        const response = await agent.process(summaryPrompt);
        
        // 3. Parse and Save
        const text = response.text.trim();
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
            try {
                const memories = JSON.parse(jsonMatch[0]);
                let count = 0;
                for (const mem of memories) {
                    if (memoryManager.addMemory(mem.topic, mem.fact, mem.tags)) {
                        count++;
                    }
                }
                printFn(`\n✅ [CRON] Memory Archive complete. Saved ${count} new memories from yesterday.\n`);
                
                // 4. Monthly Archival Rotation (if 1st of month)
                if (new Date().getDate() === 1) {
                    memoryManager.rotateArchives();
                    printFn(`\n📦 [CRON] Monthly archival rotation processed.\n`);
                }
            } catch (jsonErr) {
                throw new Error(`Invalid JSON in summarizer response: ${jsonErr.message}`);
            }
        } else {
            throw new Error("No JSON array found in summarizer response.");
        }

    } catch (e) {
        printFn(`\n❌ [CRON] Memory Archiver failed: ${e.message}\n`);
    }
}

/**
 * Checks if yesterday's log was skipped and summarizes it if needed.
 */
async function checkBootRecovery(agent, printFn) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyymmdd = yesterday.toISOString().split('T')[0];
    const logPath = path.join(process.cwd(), 'logs', `action-${yyyymmdd}.log`);

    if (fs.existsSync(logPath)) {
        // Check if we already have memories for yesterday
        const hasYesterdayMemory = memoryManager.memories.some(m => m.timestamp.startsWith(yyyymmdd));
        if (!hasYesterdayMemory) {
            logDebug(`[CRON] Boot Recovery: Yesterday's log (${yyyymmdd}) has not been summarized. Queuing now.`);
            // Run summarizer after system has fully loaded
            setTimeout(() => runMemorySummarizer(agent, printFn), 15000);
        }
    }
}
