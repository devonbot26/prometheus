import { google } from 'googleapis';

const TOKEN_PATH = './config/token.json';
import fs from 'fs/promises';

async function main() {
    const tokenContent = JSON.parse(await fs.readFile(TOKEN_PATH));
    
    const gmail = google.gmail({ version: 'v1', auth: tokenContent.access_token });
    
    try {
        const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread' });
        console.log('✅ Success! Found', res.data.results.length, 'emails');
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
