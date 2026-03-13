
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'config', 'token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive.file'
];

async function startAuth() {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const { client_secret, client_id, redirect_uris } = key;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
        });

        console.log('\n🚀 [GMAIL AUTHENTICATION]');
        console.log('1. Open this URL in your browser:');
        console.log('\x1b[36m%s\x1b[0m', authUrl);
        console.log('\n2. Sign in and grant permissions.');
        console.log('3. Copy the code from the success page (it will look like 4/...) and paste it here:');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('\n🔑 Enter the code: ', async (code) => {
            rl.close();
            try {
                console.log(`\n⏳ Attempting to exchange code with redirect_uri: ${redirect_uris[0]}...`);
                const { tokens } = await oAuth2Client.getToken(code.trim());
                await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
                console.log('\n✅ [SUCCESS] New token saved to config/token.json');
                process.exit(0);
            } catch (err) {
                console.error('\n❌ [ERROR] Failed to get token:');
                console.error(JSON.stringify(err, null, 2));
                process.exit(1);
            }
        });

    } catch (e) {
        console.error('❌ [ERROR] Fatal:', e.message);
        process.exit(1);
    }
}

startAuth();
