import { StreamWatchdog } from '../core/loop-watchdog.js';

function testWatchdog() {
    console.log('--- Testing Watchdog Thresholds ---');
    const watchdog = new StreamWatchdog();
    
    // 1. Test 5000 token limit
    console.log('Test 1: Pushing 4990 tokens...');
    for (let i = 0; i < 4990; i++) {
        watchdog.push('word ');
    }
    console.log('Stall tokens:', watchdog.tokensSinceAction);
    
    console.log('Pushing 11 more tokens...');
    const result = watchdog.push('word word word word word word word word word word word ');
    console.log('Should trigger watchdog (> 5000):', result);
    
    if (result === true && watchdog.tokensSinceAction > 5000) {
        console.log('✅ Watchdog successfully enforced 5000 token limit.');
    } else {
        console.error('❌ Watchdog failed limit test.');
    }
}

testWatchdog();
