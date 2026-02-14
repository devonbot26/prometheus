import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Scopes including Drive and Gmail
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/drive.file' // Permission to create/access files created by the app
];

const CREDENTIALS_PATH = '/Users/devonwong/Documents/ai-gmail-agent/credentials.json';
const TOKEN_PATH = '/Users/devonwong/Documents/ai-gmail-agent/token.json';

async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
    console.log('🔑 Starting Google Drive authorization...');
    console.log('   Expected credentials at:', CREDENTIALS_PATH);

    let client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });

    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

authorize()
    .then(() => {
        console.log('✅ Google Drive Authorization Successful!');
        console.log('   New token.json created with Drive permissions.');
    })
    .catch(err => {
        console.error('❌ Authorization Failed:', err.message);
    });
