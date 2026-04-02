import { modelController, PRIORITY } from '../core/model-controller.js';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('🧪 Starting Model Controller Priority Stress Test...');

    const results = [];

    // 1. Enqueue a LONG low-priority task (Simulating a summarizer)
    console.log('📥 Enqueuing Background Task 1 (LOW)...');
    modelController.enqueue('Background-1', async () => {
        console.log('⏳ Running Background Task 1 (5s)...');
        await delay(5000);
        results.push('Background-1');
        return 'BG-1 Done';
    }, { priority: PRIORITY.LOW });

    await delay(200);

    // 2. Enqueue another low-priority task
    console.log('📥 Enqueuing Background Task 2 (LOW)...');
    const bg2Promise = modelController.enqueue('Background-2', async () => {
        console.log('⏳ Running Background Task 2 (1s)...');
        await delay(1000);
        results.push('Background-2');
        return 'BG-2 Done';
    }, { priority: PRIORITY.LOW });

    await delay(200);

    // 3. Enqueue a HIGH priority task (Simulating a user prompt)
    console.log('📥 Enqueuing User Prompt (HIGH) - Should jump the queue!');
    const userPromptPromise = modelController.enqueue('User-Prompt', async () => {
        console.log('🚀 Running User Prompt (HIGH)...');
        await delay(500);
        results.push('User-Prompt');
        return 'User Done';
    }, { priority: PRIORITY.HIGH });

    // Wait for ALL tasks to finish
    await Promise.all([userPromptPromise, bg2Promise]);

    console.log('\n📊 Order of completion:', results);


    // The first task (Background-1) started first, so it should finish first (we can't pre-empt an active task).
    // BUT the HIGH priority task should have jumped ahead of Background-2.
    // Expected order: [Background-1, User-Prompt, Background-2]
    
    if (results[1] === 'User-Prompt' && results[2] === 'Background-2') {
        console.log('\n✨ SUCCESS: High priority task jumped the queue successfully!');
        process.exit(0);
    } else {
        console.log('\n❌ FAILURE: Priority scheduling failed.');
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
