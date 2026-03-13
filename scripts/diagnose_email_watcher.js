import { gmail_scan } from '../skills/gmail/bridge.js';

async function diagnose() {
    console.log('--- Email Watcher Diagnostic ---');
    console.log('Checking Gmail scan for wongcw4@gmail.com...');

    const scan = await gmail_scan({
        query: 'is:unread from:wongcw4@gmail.com',
        maxResults: 10
    });

    if (scan.success) {
        console.log(`✅ Scan Success! Found ${scan.count} unread emails.`);
        scan.messages.forEach(msg => {
            console.log(`- [${msg.id}] From: ${msg.from}, Subject: ${msg.subject}`);
        });
    } else {
        console.error('❌ Scan Failed:', scan.error);
    }
}

diagnose();
