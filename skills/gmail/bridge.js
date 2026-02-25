/**
 * Gmail Skill Bridge - Local Implementation
 * Replaces dependency on ai-gmail-agent with local Google Auth.
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'config', 'token.json');

/**
 * Authorize with Google using local credentials
 */
export async function authorize() {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const { client_secret, client_id, redirect_uris } = key;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        const tokenContent = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(tokenContent));
        return oAuth2Client;
    } catch (e) {
        console.error('Auth Error:', e.message);
        throw e;
    }
}

export async function gmail_scan() {
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // List unread messages in primary category
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread category:primary',
            maxResults: 5
        });

        if (!res.data.messages || res.data.messages.length === 0) {
            return { success: true, count: 0, messages: [] };
        }

        const details = [];
        for (const msg of res.data.messages) {
            const m = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
            });

            const headers = m.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
            const snippet = m.data.snippet;

            details.push({ id: msg.id, from, subject, snippet });
        }

        return { success: true, count: details.length, messages: details };

    } catch (error) {
        console.error('Gmail Scan Error:', error.message);
        return { success: false, error: error.message };
    }
}

export async function gmail_compose(args) {
    const { to, subject, body } = args;
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // Encode the email
        const message = [
            `To: ${to}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${subject}`,
            '',
            body
        ].join('\r\n');

        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage
            }
        });

        return { success: true, messageId: res.data.id };

    } catch (error) {
        console.error('Gmail Compose Error:', error.message);
        return { success: false, error: error.message };
    }
}
