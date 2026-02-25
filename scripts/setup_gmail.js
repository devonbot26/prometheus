import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'config', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'];

async function setup() {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const { client_secret, client_id, redirect_uris } = key;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force refresh token
    });

    console.log('\n🚀 GMAIL RE-AUTHENTICATION REQUIRED');
    console.log('1. Visit this URL in your browser:\n', authUrl);
    console.log('\n2. Authorize the app and copy the code from the success page.');
    console.log('3. Paste the code here (or send it to me):');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter the code from that page here: ', async (code) => {
        rl.close();
        try {
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
            console.log('\n✅ Success! token.json has been updated.');
            console.log('You can now run "npm run start:cli" and try your email again.');
        } catch (err) {
            console.error('❌ Error retrieving access token', err.message);
        }
    });
}

setup();
