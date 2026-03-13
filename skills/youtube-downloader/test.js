import { download_youtube_mp3 } from './index.js';

async function run() {
    // Mock process.send for testing child heartbeat
    process.send = (msg) => console.log('Mock IPC Ping:', msg);
    
    console.log('Testing single YouTube video download...');
    const result = await download_youtube_mp3({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' });
    
    console.log('\n--- Final Result ---');
    console.log(JSON.stringify(result, null, 2));
}

run();
