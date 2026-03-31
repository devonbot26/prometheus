import { io } from 'socket.io-client';
import path from 'path';

const PROMETHEUS_URL = 'http://localhost:3000';
console.log(`📡 Connecting for Context Verification: ${PROMETHEUS_URL}`);
const socket = io(PROMETHEUS_URL);

let step = 1;

socket.on('connect', () => {
    console.log('✅ Connected.');
    console.log('👉 Step 1: Requesting weather (Utility Task)');
    socket.emit('message', { text: 'what is the weather in Charlottetown?' });
});

socket.on('message', (data) => {
    if (data.role === 'assistant') {
        const content = data.content;
        
        if (content.includes('Prometheus Online')) return;

        console.log(`\n🤖 Devon Response (Step ${step}):\n`, content.substring(0, 100) + '...');
        
        if (step === 1) {
            step = 2;
            console.log('\n👉 Step 2: Asking follow-up "What was the humidity?" (Should trigger isUtility with expanded context)');
            setTimeout(() => {
                socket.emit('message', { text: 'What was the humidity again?' });
            }, 2000);
        } else {
            const hasHumidity = content.includes('84%') || content.toLowerCase().includes('humidity');
            if (hasHumidity) {
                console.log('\n✅ SUCCESS: Devon remembered the previous results!');
            } else {
                console.log('\n❌ FAILURE: Devon forgot or requested weather again.');
            }
            socket.disconnect();
            process.exit(hasHumidity ? 0 : 1);
        }
    }
});

socket.on('log', (msg) => {
    if (msg.includes('expanded') || msg.includes('Tidying')) {
        console.log(`   📝 [LOG] ${msg}`);
    }
});

setTimeout(() => {
    console.log('❌ Timeout');
    process.exit(1);
}, 180000); // 3 minute timeout for slow M1 prefill
