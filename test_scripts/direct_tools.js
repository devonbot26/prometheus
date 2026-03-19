import { search_files } from '../skills/self-coder/index.js';
import { open_app } from '../skills/macos-control/index.js';

async function runTests() {
    console.log("================================");
    console.log("▶️ DIRECT TEST 1: Phase 3 Deep Search");
    console.log("🗣️ PROMPT: search_files({ pattern: 'skill.json', search_root: './skills/macos-control' })");
    console.log("================================");
    
    // Set up env for search_files
    process.env.PROJECT_ROOT = process.cwd();
    
    const searchResult = await search_files({ pattern: 'skill.json', search_root: './skills/macos-control' });
    console.log("\nSEARCH RESULTS:");
    console.log(JSON.stringify(searchResult, null, 2));

    console.log("\n================================");
    console.log("▶️ DIRECT TEST 2: Phase 2 Native Dashboard Fallback");
    console.log("🗣️ PROMPT: open_app({ app_name: 'Notes' }) without Dashboard");
    console.log("================================");
    
    // Ensure global.io is undefined to test the fallback
    global.io = undefined;
    const appResult = await open_app({ app_name: "Notes" });
    console.log("\nFALLBACK RESULT:");
    console.log(JSON.stringify(appResult, null, 2));
}

runTests().catch(console.error);
