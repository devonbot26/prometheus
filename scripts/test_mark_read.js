import { gmail_mark_read } from '../skills/gmail/bridge.js';

async function test_mark_read() {
    const id = '19cce3d1ba6aa9e1'; // One of the unread IDs
    console.log(`Attempting to mark ${id} as read...`);
    const result = await gmail_mark_read(id);
    console.log('Result:', JSON.stringify(result, null, 2));
}

test_mark_read();
