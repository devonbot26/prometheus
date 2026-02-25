import { authorize } from '../skills/gmail/bridge.js';
import { google } from 'googleapis';

async function verify() {
    try {
        console.log('🔍 Testing Gmail Authentication...');
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        console.log('📡 Fetching profile...');
        const res = await gmail.users.getProfile({ userId: 'me' });
        console.log('✅ Auth Successful! Email:', res.data.emailAddress);
    } catch (e) {
        console.error('❌ Auth Failed:', e.message);
        if (e.message.includes('invalid_grant')) {
            console.log('\n💡 The refresh token is invalid or revoked. You need to re-authenticate.');
        }
    }
}

verify();
