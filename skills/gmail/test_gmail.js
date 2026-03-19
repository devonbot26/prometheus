import { authorize } from './bridge.js';
import { google } from 'googleapis';

async function test() {
    console.log('🧪 Testing Gmail access...');
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        console.log('\n🏷️ Listing Labels...');
        const labelRes = await gmail.users.labels.list({ userId: 'me' });
        console.log('Labels:', labelRes.data.labels?.map(l => l.name).join(', '));

        const queries = [
            'is:unread category:primary',
            'is:unread',
            'after:2026/03/01',
            ''
        ];

        for (const q of queries) {
            console.log(`\n🔍 Query: "${q}"`);
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: q,
                maxResults: 1
            });
            console.log('Success! Result count:', res.data.resultSizeEstimate);
            if (res.data.messages) {
                console.log('Messages found:', res.data.messages.length);
            } else {
                console.log('No messages field in response.');
            }
        }
    } catch (e) {
        console.log('💥 Error:', e.message);
    }
}

test();
