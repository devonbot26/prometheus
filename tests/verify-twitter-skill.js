import { post_tweet, sentiment_gatekeeper } from '../skills/twitter-assistant/index.js';
import assert from 'assert';

/**
 * GEP Verification Audit: Twitter Skill
 */

async function runAudit() {
    console.log('🛡️ Starting Twitter Skill Audit...\n');

    // 1. Length Validation
    console.log('Test 1: Length Validation...');
    const longTweet = 'A'.repeat(281);
    const lengthResult = await post_tweet({ text: longTweet });
    assert.strictEqual(!!lengthResult.error, true, 'Should reject tweets > 280 chars');
    console.log('✅ Passed: Length rejected correctly.\n');

    // 2. Sentiment Gatekeeper
    console.log('Test 2: Sentiment Gatekeeper...');
    const spamTweet = 'Buy now! Spam click here!';
    const gateResult = await sentiment_gatekeeper({ draft: spamTweet });
    assert.strictEqual(gateResult.safe, false, 'Should flag spam keywords');
    console.log('✅ Passed: Spam flagged correctly.\n');

    const safeTweet = 'Just finished Phase 6 of the Prometheus project!';
    const safeResult = await sentiment_gatekeeper({ draft: safeTweet });
    assert.strictEqual(safeResult.safe, true, 'Should allow safe content');
    console.log('✅ Passed: Safe content allowed.\n');

    console.log('🏆 Audit Complete: Twitter skill is safe for deployment (Mock).');
}

runAudit().catch(err => {
    console.error(`\n❌ Audit Failed: ${err.message}`);
    process.exit(1);
});
