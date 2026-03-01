import { scrape_subreddit, search_reddit } from './skills/reddit-observer/index.js';

async function runTest() {
    console.log("🔍 Running audit for Reddit Observer...");
    try {
        console.log("\n--- Testing scrape_subreddit ---");
        const scrapeResult = await scrape_subreddit({ subreddit: 'programming' });
        console.log(JSON.stringify(scrapeResult, null, 2).substring(0, 500) + "...");

        console.log("\n--- Testing search_reddit ---");
        const searchResult = await search_reddit({ query: 'LLM scaling laws' });
        console.log(JSON.stringify(searchResult, null, 2).substring(0, 500) + "...");
    } catch (e) {
        console.error("❌ Audit Failed:", e);
    }
}

runTest();
