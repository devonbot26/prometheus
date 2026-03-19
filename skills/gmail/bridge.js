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

/**
 * Helper to recursively extract the plain text body from a Gmail message payload
 */
function getBody(payload) {
    let body = "";
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body.data) {
                body += Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else if (part.parts) {
                body += getBody(part);
            }
        }
    } else if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    return body;
}

export async function gmail_scan(options = {}) {
    const q = options.query || 'is:unread';
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
            const date = headers.find(h => h.name === 'Date')?.value || '';
            const snippet = m.data.snippet;
            const threadId = m.data.threadId;

            const messageObj = { id: msg.id, threadId, from, subject, date, snippet };
            
            if (options.includeBody) {
                messageObj.body = getBody(m.data.payload);
            }

            details.push(messageObj);
        }

        return { success: true, count: details.length, messages: details };

    } catch (error) {
        logDebugError('Gmail Scan Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Retrieve full details of a specific message
 */
export async function gmail_read(args) {
    const { messageId } = args;
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        const m = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        const headers = m.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const threadId = m.data.threadId;
        const body = getBody(m.data.payload);

        return { 
            success: true, 
            message: { id: messageId, threadId, from, subject, date, body } 
        };
    } catch (error) {
        logDebugError('Gmail Read Error:', error.message);
        return { success: false, error: error.message };
    }
}

export async function gmail_compose(args) {
    const { to, subject, body, threadId } = args;
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // Encode the email
        const messageParts = [
            `To: ${to}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${subject}`,
            ''
        ];
        
        messageParts.push(body);
        const message = messageParts.join('\r\n');

        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const requestBody = { raw: encodedMessage };
        if (threadId) requestBody.threadId = threadId;

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody
        });

        return { success: true, messageId: res.data.id, threadId: res.data.threadId };

    } catch (error) {
        logDebugError('Gmail Compose Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Mark a message as read (remove UNREAD label)
 */
export async function gmail_mark_read(args) {
    const { messageId } = args;
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
export async function gmail_reply(args) {
    const { threadId, body } = args;
    try {
        const auth = await authorize();
        const gmail = google.gmail({ version: 'v1', auth });

        // 1. Get the thread to find the latest message and participants
        const thread = await gmail.users.threads.get({
            userId: 'me',
            id: threadId
        });

        if (!thread.data.messages || thread.data.messages.length === 0) {
            throw new Error('Thread not found or empty');
        }

        const lastMsg = thread.data.messages[thread.data.messages.length - 1];
        const headers = lastMsg.payload.headers;
        
        const from = headers.find(h => h.name === 'From')?.value;
        const subject = headers.find(h => h.name === 'Subject')?.value;
        const messageId = headers.find(h => h.name === 'Message-ID')?.value;
        const references = headers.find(h => h.name === 'References')?.value || '';

        // 2. Compose the reply
        const message = [
            `To: ${from}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: Re: ${subject}`,
            `In-Reply-To: ${messageId}`,
            `References: ${references} ${messageId}`.trim(),
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
                threadId: threadId
            }
        });

        return { success: true, messageId: res.data.id, threadId: res.data.threadId };
    } catch (error) {
        logDebugError('Gmail Reply Error:', error.message);
        return { success: false, error: error.message };
    }
}
