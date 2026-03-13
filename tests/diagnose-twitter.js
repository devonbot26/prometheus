import 'dotenv/config';
import { post_tweet, get_me } from '../skills/twitter-assistant/index.js';

async function testAuth() {
    console.log('--- Twitter Diagnostic Test ---');
    console.log('API Key:', process.env.TWITTER_API_KEY ? 'Present' : 'MISSING');
    console.log('Access Token:', process.env.TWITTER_ACCESS_TOKEN ? 'Present' : 'MISSING');

    console.log('\nTesting GET /2/users/me...');
    const meResult = await get_me();
    console.log('GET /me Result:', JSON.stringify(meResult, null, 2));

    if (meResult.status === 200) {
        console.log('\nTesting POST /2/tweets...');
        const postResult = await post_tweet({ text: "Diagnostic test from Prometheus! " + new Date().toISOString() });
        console.log('POST Result:', JSON.stringify(postResult, null, 2));
    } else {
        console.log('\nSkipping POST test because GET /me failed.');
    }
}

testAuth().catch(err => {
    console.error('Diagnostic Script Failed:', err);
});
