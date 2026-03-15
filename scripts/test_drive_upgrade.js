/**
 * Verification Script: Google Drive Skill Upgrade
 * Validates PathResolver, ExportMapper, and new tool functions.
 */

import { 
    drive_list, 
    drive_peek, 
    drive_read, 
    drive_write, 
    drive_trash 
} from '../skills/google-drive/bridge.js';

async function runTests() {
    console.log('🧪 Starting Google Drive Upgrade Verification...\n');

    try {
        // 1. Test Listing Root
        console.log('📁 Testing drive_list("/")...');
        const listRes = await drive_list({ path: '/' });
        if (listRes.success) {
            console.log(`✅ Success! Found ${listRes.files.length} items.\n`);
        } else {
            console.error('❌ Failed drive_list:', listRes.error);
        }

        // 2. Test Writing a File (Deep Path)
        const testPath = '/Prometheus_Test_Folder/v2_test.txt';
        console.log(`📝 Testing drive_write("${testPath}")...`);
        const writeRes = await drive_write({ 
            path: testPath, 
            content: 'Hello from Prometheus V2! This is a verification test for the upgraded Google Drive skill.' 
        });
        if (writeRes.success) {
            console.log(`✅ Success! ${writeRes.message}\n`);
        } else {
            console.error('❌ Failed drive_write:', writeRes.error);
        }

        // 3. Test Peeking at the new file
        console.log(`🔍 Testing drive_peek("${testPath}")...`);
        const peekRes = await drive_peek({ path: testPath });
        if (peekRes.success) {
            console.log(`✅ Success! Peeked content sample: "${peekRes.peek.substring(0, 50)}..."\n`);
        } else {
            console.error('❌ Failed drive_peek:', peekRes.error);
        }

        // 4. Test Trashing the file
        console.log(`🗑️ Testing drive_trash("${testPath}")...`);
        const trashRes = await drive_trash({ path: testPath });
        if (trashRes.success) {
            console.log(`✅ Success! ${trashRes.message}\n`);
        } else {
            console.error('❌ Failed drive_trash:', trashRes.error);
        }

    } catch (e) {
        console.error('🔥 CRITICAL ERROR during verification:', e.message);
    }

    console.log('\n🏁 Verification Complete.');
}

runTests();
