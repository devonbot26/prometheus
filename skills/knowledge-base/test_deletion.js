import { delete_knowledge } from './index.js';

async function testDeletion() {
    console.log('🗑️ Testing delete_knowledge...');
    const result = await delete_knowledge({ 
        query: "**Weather Forecast Query: Direct API vs Web Search**" 
    });
    console.log('Result:', result);
}

testDeletion().catch(console.error);
