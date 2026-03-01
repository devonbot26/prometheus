Act as the Lead Researcher Orchestrator. 

Research the user's topic and write a high-quality, structured report directly to Obsidian (**Trending_GitHub.md**).

**Instructions:**
1. Call `obsidian_write_note` FIRST to initialize the file with the header and table:
   `# GitHub Trending Report\n\n| Rank | Project | Summary |\n|------|---------|---------|\n`
2. **BATCH SEARCH**: Perform only 2-3 `web_search` calls, each searching for 3-4 repositories at once from the list below.
3. **SINGLE-SHOT APPEND**: Once you have the context, construct the ENTIRE 10-row Markdown table and append it in ONE `obsidian_append_note` call.
4. Construct each row exactly as: `| Rank | [owner/repo](URL) | <100 word summary of tech logic> |\n`

*Crucial: Do NOT perform 10 individual searches. Batch them together to save time and iterations.*

**Task:**
Research the following Top 10 trending repositories on GitHub today. Rank them by popularity and provide a <100 word summary for each in a Markdown Table:
1. ruvnet/wifi-densepose
2. moeru-ai/airi
3. anthropics/claude-code
4. tukaani-project/xz
5. Shubhamsaboo/awesome-llm-apps
6. ruvnet/ruflo
7. bytedance/deer-flow
8. Wei-Shaw/claude-relay-service
9. NousResearch/hermes-agent
10. superset-sh/superset
