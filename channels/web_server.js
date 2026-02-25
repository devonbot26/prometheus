import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent } from '../core/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../public');

// Initialize Agent
const agent = new Agent();

// Initialize Web Server
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve Static Files
app.use(express.static(PUBLIC_DIR));

// Handle Socket Connections
io.on('connection', (socket) => {
    console.log('🌐 Web Client Connected');

    // Send stats on connection
    socket.emit('usage', agent.quotaTracker.getStats());

    // Handle incoming messages from UI
    socket.on('message', async (text) => {
        try {
            socket.emit('status', 'Thinking...');
            // In the UI, the user message is added optimistically or echoed here
            socket.emit('message', { role: 'user', content: text });

            const result = await agent.process(text);
            // Result is emitted by agent.on('message') in Agent constructor or process
            // But we can also handle final output here if needed.
            socket.emit('status', 'Idle');
        } catch (e) {
            socket.emit('status', 'Error');
            socket.emit('message', { role: 'assistant', content: `⚠️ Error: ${e.message}` });
        }
    });
});

// Bind Agent Events to Socket.io
agent.on('usage', (stats) => {
    io.emit('usage', stats);
});

agent.on('message', (msg) => {
    io.emit('message', msg);
});

agent.on('tool_start', (data) => {
    io.emit('log', `🔧 Calling tool: ${data.tool}`);
    io.emit('status', `Executing: ${data.tool}`);
});

agent.on('tool_end', (data) => {
    io.emit('log', `✅ Tool finished: ${data.tool}`);
    io.emit('status', 'Thinking...');
});

// Start Server
const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 Prometheus Dashboard: http://localhost:${PORT}`);
    console.log(`🧠 Agent loaded with ${agent.skills.size} skills.`);
});
