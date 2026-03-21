import 'dotenv/config';
import { Agent } from '../core/agent.js';

async function testDrive() {
    const agent = new Agent();
    agent.activeMode = 'primary';
    
    // Test Listing
    console.log('--- TESTING DRIVE LIST ---');
    const listRes = await agent.process("Niki, list the files in my Google Drive root /");
    console.log('\nResponse:', listRes.text);

    // Test Write (if previous successful or just direct)
    console.log('\n--- TESTING DRIVE WRITE ---');
    const writeRes = await agent.process("Niki, write a file to /TestPrometheus.txt with content 'Hello from Prometheus!'");
    console.log('\nResponse:', writeRes.text);
}

testDrive();
