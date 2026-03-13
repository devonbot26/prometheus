import { EmailWatcher } from '../services/email-command-watcher.js';
import { Agent } from '../core/agent.js';

// Mock Bridge Helpers
const mockBridge = {
    gmail_scan: async () => ({ success: true, messages: [] }),
    gmail_mark_read: async () => ({ success: true }),
    gmail_reply: async () => ({ success: true }),
    authorize: async () => ({})
};

// Mock IO
const mockIo = {
    emit: (event, data) => {
        console.log(`[EVENT] ${event}:`, data);
    }
};

// Mock Agent
const agent = new Agent();
agent.process = async (subject) => {
    console.log(`[AGENT] Processing: ${subject}`);
    if (subject.includes('fail')) throw new Error('Simulated failure');
    return { text: `Success result for ${subject}` };
};

const watcher = new EmailWatcher(agent, mockIo, mockBridge);

async function runTests() {
    console.log('--- Starting EmailWatcher Logic Tests ---');

    // Test 1: Security Blocklist
    console.log('\nTest 1: Security Blocklist');
    await watcher.processEmail({ id: '123', subject: 'rm -rf /', snippet: '' });

    // Test 2: Success Flow
    console.log('\nTest 2: Success Flow');
    await watcher.processEmail({ id: '456', subject: 'what is 1+1', snippet: '' });

    // Test 3: Failure Flow
    console.log('\nTest 3: Failure Flow');
    await watcher.processEmail({ id: '789', subject: 'this should fail', snippet: '' });

    console.log('\n--- Tests Complete ---');
    process.exit(0);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
