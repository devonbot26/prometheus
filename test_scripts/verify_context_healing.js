import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';

const socket = io('http://localhost:3000');

async function test() {
    console.log('🧪 Starting Context Healing Verification...');

    socket.on('connect', async () => {
        console.log('✅ Connected.');

        // Step 1: Establish technical context
        console.log('📥 Step 1: Sending complex context...');
        socket.emit('message', { text: "I'm working on a project called 'Antigravity'. It uses a local MLX server for 4B/9B models. Remember the name 'Antigravity' and that we are using MLX." });
    });

    let step = 1;
    socket.on('message', (data) => {
        if (data.role !== 'assistant' || data.content.includes('Welcome')) return;

        console.log(`\n🤖 Assistant [Step ${step}]:`, data.content.substring(0, 50) + '...');

        if (step === 1) {
            // Step 2: Send a greeting (The Pruning Test)
            step = 2;
            console.log('\n📥 Step 2: Sending a greeting (Testing pruning logic)...');
            socket.emit('message', { text: "Hi Devon! How are you today?" });
        } else if (step === 2) {
            // Step 3: Recall the context
            step = 3;
            console.log('\n📥 Step 3: Recalling previous context...');
            socket.emit('message', { text: "What was the name of the project I mentioned earlier, and what server are we using?" });
        } else if (step === 3) {
            // Step 4: Verify
            if (data.content.toLowerCase().includes('antigravity') && data.content.toLowerCase().includes('mlx')) {
                console.log('\n✨ SUCCESS: Context persists despite the greeting!');
            } else {
                console.log('\n❌ FAILURE: Context was lost after the greeting.');
            }
            socket.disconnect();
            process.exit(0);
        }
    });
}

test();

setTimeout(() => {
    console.log('❌ Timeout.');
    process.exit(1);
}, 120000);
