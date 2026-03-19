import { fetch_transcript, summarize_video } from '../skills/youtube-analyst/index.js';

async function runTest() {
    console.log("🔍 Running audit for YouTube Analyst...");
    try {
        console.log("\n--- Testing fetch_transcript (Valid URL) ---");
        // Use a short, popular video to test (e.g. Marques Brownlee or similar)
        // This is Marques Brownlee's M4 Mac mini review
        const transcriptResult = await fetch_transcript({ url: 'https://www.youtube.com/watch?v=c0iOnzEpyJw' });
        console.log(JSON.stringify(transcriptResult, null, 2).substring(0, 500) + "...");

        console.log("\n--- Testing summarize_video (Different URL) ---");
        // Using another short video 
        const summaryResult = await summarize_video({ url: 'https://www.youtube.com/watch?v=c0iOnzEpyJw' });
        console.log(JSON.stringify(summaryResult, null, 2));

    } catch (e) {
        console.error("❌ Audit Failed:", e);
    }
}

runTest();
