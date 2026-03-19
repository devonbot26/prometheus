import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('✅ Connected to Prometheus for behavior test.');
    // Delay slightly to avoid being swallowed by the welcome sequence
    setTimeout(() => {
        socket.emit('message', { text: 'check any new email' });
    }, 1000);
});

socket.on('message', (data) => {
    if (data.role === 'assistant') {
        const content = data.content;
        console.log('\n🤖 Assistant Response Part:\n', content);
        
        // If it's a real response (not just a welcome), we're done
        if (!content.includes('Prometheus Online') && !content.includes('ready for your next command')) {
            console.log('\n✅ Test complete. Disconnecting.');
            socket.disconnect();
            process.exit(0);
        }
    }
});

socket.on('think_stream', (chunk) => {
    process.stdout.write(chunk);
});

setTimeout(() => {
    console.log('❌ Timeout: No response from Prometheus.');
    process.exit(1);
}, 60000);
