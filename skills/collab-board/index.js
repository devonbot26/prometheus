/**
 * Collab Board Skill
 * Allows Prometheus to read messages from Antigravity/User and archive them.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { save_knowledge } from '../knowledge-base/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.resolve(__dirname, '../../messages');
const INBOX_FILE = path.join(MESSAGES_DIR, 'inbox.json');
const OUTBOX_FILE = path.join(MESSAGES_DIR, 'outbox.json');

// Ensure messages directory exists
if (!fs.existsSync(MESSAGES_DIR)) {
    fs.mkdirSync(MESSAGES_DIR, { recursive: true });
}

// Helpers
const readJson = (file) => {
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return [];
    }
};

const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));


export async function check_messages() {
    console.log('📬 Checking inbox...');
    const messages = readJson(INBOX_FILE);

    if (messages.length === 0) {
        return { message: 'No new messages.' };
    }

    const report = [];

    for (const msg of messages) {
        const { sender, content, timestamp } = msg;

        // 1. Process Message
        report.push(`[${new Date(timestamp).toLocaleString()}] From ${sender}: ${content}`);

        // 2. Archive to Knowledge Base
        try {
            await save_knowledge({
                text: `Message from ${sender}: "${content}"`,
                topic: `Communication/${sender}`
            });
            report.push(`  (Archived to Knowledge Base under [[Communication/${sender}]])`);
        } catch (e) {
            console.error(`Failed to archive message from ${sender}:`, e);
            report.push(`  (Failed to archive: ${e.message})`);
        }
    }

    // 3. Clear Inbox (Mark as read)
    writeJson(INBOX_FILE, []);

    return {
        success: true,
        message: `Found ${messages.length} new messages:\n\n` + report.join('\n')
    };
}


export async function leave_message(args) {
    const { recipient, message } = args;

    if (!recipient || !message) return { error: 'Recipient and message are required.' };

    const outbox = readJson(OUTBOX_FILE);

    const newMsg = {
        sender: 'Prometheus',
        recipient,
        content: message,
        timestamp: Date.now()
    };

    outbox.push(newMsg);
    writeJson(OUTBOX_FILE, outbox);

    console.log(`📤 Message sent to ${recipient}: "${message.substring(0, 50)}..."`);

    // Also save a copy to own memory so it remembers what it said
    await save_knowledge({
        text: `I sent a message to ${recipient}: "${message}"`,
        topic: `Communication/Prometheus_Outbox`
    });

    return { success: true, message: `Message left for ${recipient}.` };
}
