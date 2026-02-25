import cron from 'node-cron';

/**
 * Initializes all background Cron Jobs for Prometheus
 * @param {Agent} agent - The main agent instance to inject prompts into
 * @param {Function} printFn - Callback strictly to print output to the active channel
 */
export function initCronJobs(agent, printFn) {
    if (!agent) {
        throw new Error("Cannot init cron jobs without an initialized Agent.");
    }

    console.log('[DEBUG] Initializing Scheduled Cron Jobs...');

    // Job 1: Morning Briefing at 8:00 AM every day
    cron.schedule('0 8 * * *', async () => {
        try {
            printFn("\n[BACKGROUND TASK STARTED: Morning Briefing]\n");
            // We pass in a system prompt telling Devon to use its tools autonomously to prepare a briefing
            const prompt = "[SYSTEM] Good morning. Please use the get_weather tool to fetch the weather in your configured location, and then use any calendar tools or email tools to check my agenda. Finally, print a helpful morning briefing for me.";

            // Process the prompt silently without appending to user history if necessary,
            // or just inject it directly to trigger tool use.
            const response = await agent.process(prompt);

            printFn(`\n☀️ Morning Briefing: ${response.text}\n`);
        } catch (e) {
            printFn(`\n❌ Background Task failed: ${e.message}\n`);
        }
    });

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

    console.log('[DEBUG] Cron jobs scheduled.');
}
