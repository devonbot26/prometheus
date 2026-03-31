import { fetch_canadian_lotto } from './skills/web-search/bridge.js';

async function test() {
    console.log('🧪 Testing fetch_canadian_lotto(lotto649, 2026-03-28)...');
    const result = await fetch_canadian_lotto({ game: 'lotto649', draw_date: '2026-03-28' });
    console.log('Result Success:', result.success);
    if (result.success) {
        console.log('Output Snippet:', result.output.substring(0, 1000));
    } else {
        console.log('Error:', result.error);
    }
}

test();
