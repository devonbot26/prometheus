/**
 * Gmail Skill Bridge - Local Implementation
 * Replaces dependency on ai-gmail-agent with local Google Auth.
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { logDebugError } from '../../core/logger.js';

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
        const token = JSON.parse(tokenContent);
        oAuth2Client.setCredentials(token);

        // Check if token needs refresh
        if (token.expiry_date && Date.now() >= token.expiry_date) {
            console.log('🔄 [GMAIL] Token expired. Refreshing...');
            const { credentials } = await oAuth2Client.refreshAccessToken();
            oAuth2Client.setCredentials(credentials);
            // Save the updated token (merge with refresh_token if refreshAccessToken doesn't return it)
            const updatedToken = { ...token, ...credentials };
            await fs.writeFile(TOKEN_PATH, JSON.stringify(updatedToken));
            console.log('✅ [GMAIL] Token refreshed and saved.');
        }

        return oAuth2Client;
    } catch (e) {
        logDebugError('Auth Error:', e.message);
        throw e;
    }
}

export async function gmail_scan(options = {}) {
    const q = options.query || 'is:unread category:primary';
    const maxResults = options.maxResults || 5;

    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // List messages based on query
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: q,
            maxResults: maxResults
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
            const threadId = m.data.threadId;

            details.push({ id: msg.id, threadId, from, subject, snippet, headers });
        }

        return { success: true, count: details.length, messages: details };

    } catch (error) {
        logDebugError('Gmail Scan Error:', error.message);
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
        logDebugError('Gmail Compose Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Mark a message as read (remove UNREAD label)
 */
export async function gmail_mark_read(messageId) {
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                removeLabelIds: ['UNREAD']
            }
        });

        return { success: true };
    } catch (error) {
        logDebugError('Gmail Mark Read Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Reply to an existing thread
 */
export async function gmail_reply(originalMsg, body) {
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // Extract metadata for reply
        const headers = originalMsg.headers || [];
        const to = headers.find(h => h.name === 'From')?.value;
        const subject = headers.find(h => h.name === 'Subject')?.value;
        const threadId = originalMsg.id; // Or threadId? headers often have References

        const message = [
            `To: ${to}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: Re: ${subject}`,
            `In-Reply-To: ${originalMsg.id}`,
            `References: ${originalMsg.id}`,
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
                raw: encodedMessage,
                threadId: originalMsg.threadId || threadId
            }
        });

        return { success: true, messageId: res.data.id };
    } catch (error) {
        logDebugError('Gmail Reply Error:', error.message);
        return { success: false, error: error.message };
    }
}
