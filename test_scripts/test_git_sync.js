import { git_sync } from '../skills/sys-admin/index.js';

async function test() {
    console.log('--- Testing Git Sync after Binary Detachment ---');
    const result = await git_sync({ message: 'test: verify backup after binary cleanup' });
    console.log('Result:', result);
}

test().catch(console.error);
