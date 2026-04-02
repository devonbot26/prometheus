import { drive_backup } from '../skills/google-drive/bridge.js';

async function test() {
    console.log('--- Testing Google Drive Backup ---');
    const result = await drive_backup();
    console.log('Result:', result);
}

test().catch(console.error);
