import { gmail_scan } from '../skills/gmail/bridge.js';
import { web_search } from '../skills/web-search/bridge.js';
import { get_weather } from '../skills/weather/index.js';

console.log('🧪 Starting Verification Tests...\n');

async function testGmail() {
    console.log('--- Testing Gmail Skill ---');
    try {
        const result = await gmail_scan();
        console.log('✅ Gmail result received');
        // console.log(JSON.stringify(result, null, 2).substring(0, 100) + '...');
    } catch (e) {
        console.error('❌ Gmail Error:', e.message);
    }
}

async function testWebSearch() {
    console.log('--- Testing Web Search Skill ---');
    try {
        const result = await web_search({ query: 'test' });
        console.log('✅ Web Search result received');
    } catch (e) {
        console.error('❌ Web Search Error:', e.message);
    }
}

async function testWeather() {
    console.log('--- Testing Weather Skill ---');
    try {
        const result = await get_weather({ location: 'PEI' });
        console.log('✅ Weather result received');
    } catch (e) {
        console.error('❌ Weather Error:', e.message);
    }
}

import { drive_backup } from '../skills/google-drive/bridge.js';

async function testDriveBackup() {
    console.log('--- Testing Google Drive Backup ---');
    try {
        const result = await drive_backup();
        console.log('✅ Drive Backup result:', result);
    } catch (e) {
        console.error('❌ Drive Backup Error:', e.message);
    }
}

async function runTests() {
    await testGmail();
    console.log('');
    await testWebSearch();
    console.log('');
    await testWeather();
    console.log('');
    await testDriveBackup();
    console.log('\n🏁 Tests Finished.');
}

runTests();
