import 'dotenv/config';
import { Agent } from '../core/agent.js';

async function verifyDevon() {
    console.log('👀 [VERIFICATION] Testing Devon with "What is the weather?"...');
    const devon = new Agent();
    devon.setMode('primary');

    const prompt = "What is the weather?";
    console.log(`🗣️  USER: ${prompt}`);

    const response = await devon.process(prompt);

    console.log(`\n🤖 DEVON:`);
    console.log(response.text);

    if (response.text.includes('Charlottetown')) {
        console.log('\n✅ [SUCCESS] Devon localized the weather to Charlottetown correctly.');
    } else {
        console.log('\n❌ [FAILURE] Devon did not use the default location correctly or failed to call the tool.');
    }
}

verifyDevon().catch(console.error);
