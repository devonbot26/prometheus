import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('✅ Connected to Prometheus Server');
    console.log('📤 Sending: "any new emails?"');
    socket.emit('message', { text: 'any new emails?', clientTimestamp: Date.now() });
});

socket.on('status', (status) => {
    console.log(`📡 [STATUS] ${status}`);
});

socket.on('message', (msg) => {
    console.log(`🤖 [MESSAGE]`, msg);
    process.exit(0);
});

socket.on('log', (log) => {
    console.log(`📄 [LOG] ${log}`);
});

socket.on('error', (err) => {
    console.error(`❌ [ERROR]`, err);
});

setTimeout(() => {
    console.error('⌛ Timeout waiting for response');
    process.exit(1);
}, 180000); // 3 minutes
