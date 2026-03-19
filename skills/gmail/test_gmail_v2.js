import { gmail_scan, gmail_read } from './bridge.js';

async function testV2() {
    console.log('🧪 Testing Gmail Skill V2 Enhancements...');
    
    try {
        // 1. Test scan with including body
        console.log('\n🔍 Testing gmail_scan with includeBody: true...');
        const scanRes = await gmail_scan({ query: 'after:2025/01/01', maxResults: 1, includeBody: true });
        if (scanRes.success && scanRes.messages.length > 0) {
            const msg = scanRes.messages[0];
            console.log('✅ Found message:', msg.subject);
            console.log('💡 Body length:', msg.body?.length || 0);
            if (msg.body) {
                console.log('📄 Body snippet:', msg.body.substring(0, 100).replace(/\n/g, ' '));
            }

            // 2. Test gmail_read using the ID from scan
            console.log('\n📖 Testing gmail_read for ID:', msg.id);
            const readRes = await gmail_read({ messageId: msg.id });
            if (readRes.success) {
                console.log('✅ Success! Subject:', readRes.message.subject);
                console.log('💡 Full Body length:', readRes.message.body.length);
            } else {
                console.log('❌ gmail_read failed:', readRes.error);
            }
        } else {
            console.log('ℹ️ No messages found to test body extraction.');
        }

    } catch (e) {
        console.log('💥 Error during test:', e.message);
    }
}

testV2();
