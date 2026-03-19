import { Agent } from './core/agent.js';
import { QUOTA_TIERS, quotaManager } from './core/quota-manager.js';

async function testQuotaGuard() {
    console.log("--- Quota Guard Logic Test ---");

    const agent = new Agent();

    // 1. Standalone QuotaManager check
    console.log("\n1. Testing QuotaManager standalone logic...");
    for (let i = 1; i <= 5; i++) {
        quotaManager.recordRequest(QUOTA_TIERS.AUTOMATED);
    }

    if (quotaManager.allow(QUOTA_TIERS.AUTOMATED) === false) {
        console.log("✅ Success: Automated limit (5) reached and enforced.");
    } else {
        console.log("❌ Fail: Automated limit not enforced.");
        process.exit(1);
    }

    // 2. Integration check with Agent.process
    console.log("\n2. Testing Agent integration...");
    try {
        console.log("Calling agent.process(tier=AUTOMATED) while exhausted...");
        await agent.process("test command", QUOTA_TIERS.AUTOMATED);
    } catch (e) {
        if (e.message === "QUOTA_EXCEEDED") {
            console.log("✅ Success: Agent correctly caught QUOTA_EXCEEDED error.");
        } else {
            console.log(`❌ Unexpected error from agent: ${e.message}`);
            process.exit(1);
        }
    }

    // 3. Testing INTERACTIVE priority
    console.log("\n3. Testing INTERACTIVE priority...");
    if (quotaManager.allow(QUOTA_TIERS.INTERACTIVE) === true) {
        console.log("✅ Success: INTERACTIVE request allowed despite AUTOMATED exhaustion.");
    } else {
        console.log("❌ Fail: INTERACTIVE request blocked.");
        process.exit(1);
    }

    // 4. Testing Safe Mode (429 backoff)
    console.log("\n4. Testing Safe Mode backoff...");
    quotaManager.triggerSafeMode();
    if (quotaManager.allow(QUOTA_TIERS.INTERACTIVE) === false) {
        const status = quotaManager.getStatus();
        console.log(`✅ Success: Safe Mode active. Backoff: ${status.safeModeRemaining}s.`);
    } else {
        console.log("❌ Fail: INTERACTIVE allowed during Safe Mode.");
        process.exit(1);
    }

    console.log("\n--- Quota Guard Test Complete: PASS ---");
    process.exit(0);
}

testQuotaGuard().catch(e => {
    console.error(e);
    process.exit(1);
});
