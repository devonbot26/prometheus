import { acquireLock, releaseLock } from './core/llm_lock.js';
import fs from 'fs';

async function runTest() {
    console.log("🧪 Testing LLM Lock...");
    
    // 1. Initial Acquisition
    const lock1 = acquireLock('test1');
    console.log(`Lock 1 acquired: ${lock1}`);
    if (!lock1) throw new Error("Should have acquired initial lock");

    // 2. Reject while held
    const lock2 = acquireLock('test2');
    console.log(`Lock 2 acquired while held: ${lock2}`);
    if (lock2) throw new Error("Should NOT have acquired lock 2");

    // 3. Test release
    releaseLock();
    const lock3 = acquireLock('test3');
    console.log(`Lock 3 acquired after release: ${lock3}`);
    if (!lock3) throw new Error("Should have acquired lock 3");

    // 4. Test TTL
    console.log("Testing TTL (simulating stale lock)...");
    const lockFile = './logs/llm.lock';
    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
    lockData.timestamp -= 121000; // 121s ago
    fs.writeFileSync(lockFile, JSON.stringify(lockData));

    const lock4 = acquireLock('test4');
    console.log(`Lock 4 (stale acquisition) acquired: ${lock4}`);
    if (!lock4) throw new Error("Should have acquired stale lock");

    releaseLock();
    console.log("✅ All lock tests passed.");
}

runTest().catch(err => {
    console.error(`❌ Test failed: ${err.message}`);
    process.exit(1);
});
