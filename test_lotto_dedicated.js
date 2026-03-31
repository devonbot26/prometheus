import { get_latest_649 } from './skills/lotto-checker/bridge.js';

async function test() {
    console.log('🧪 Testing lotto-checker.get_latest_649()...');
    const result = await get_latest_649();
    console.log('Result Success:', result.success);
    if (result.success) {
        console.log('Output Snippet:', result.output.substring(0, 1000));
    } else {
        console.log('Error:', result.error);
    }
}

test();
