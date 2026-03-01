import { read_webpage } from '../web-scraper/index.js';
import { web_search } from '../web-search/bridge.js';
import { logDebug, logDebugError } from '../../core/logger.js';

/**
 * Node-based Decision Tree for Scraping a Subreddit
 */
export async function scrape_subreddit(args) {
    let { subreddit, sort } = args;

    // Node 1: Input Validation
    logDebug(`[DEBUG] Node 1: Validating subreddit input...`);
    if (!subreddit || typeof subreddit !== 'string') {
        logDebugError(`[DEBUG] Node 1 Error: Missing subreddit parameter.`);
        return { error: "Missing required parameter 'subreddit'.", hint: "Provide a valid subreddit name, like 'programming'." };
    }

    subreddit = subreddit.replace('r/', '').replace('/', '');
    const sortParams = sort === 'top' ? 'top/?t=month' : (sort || 'hot');
    const url = `https://old.reddit.com/r/${subreddit}/${sortParams}`;

    logDebug(`[DEBUG] Node 2: Attempting to scrape ${url}`);

    try {
        // Node 2: Scrape via web-scraper (Puppeteer)
        const scrapeResult = await read_webpage({ url });

        if (scrapeResult && typeof scrapeResult.result === 'string' && scrapeResult.result.length > 50) {
            logDebug(`[DEBUG] Node 3: Scrape successful. Formatting data...`);

            // Limit the raw output to prevent token overflow (~8000 chars)
            const cleanContent = scrapeResult.result.substring(0, 8000);

            return {
                source: "old.reddit.com via web-scraper",
                subreddit: `r/${subreddit}`,
                content: cleanContent,
                note: "Use the content heavily for sentiment analysis."
            };
        } else {
            throw new Error("Scraper returned empty or blocked content.");
        }

    } catch (e) {
        logDebugError(`[DEBUG] Node 2 Error: Scraping failed -> ${e.message}`);
        logDebug(`[DEBUG] Node 4: Executing Fallback (DuckDuckGo Search)`);

        // Node 4: Fallback Search
        try {
            const fallbackResult = await web_search({ query: `site:reddit.com/r/${subreddit} trending OR hot` });
            return {
                warning: "Direct scraping was blocked. Returning DuckDuckGo search results for the subreddit instead.",
                source: "DuckDuckGo (Fallback)",
                results: fallbackResult
            };
        } catch (fallbackError) {
            return {
                error: `Both primary scrape and fallback search failed: ${fallbackError.message}`
            };
        }
    }
}

/**
 * Node-based Decision Tree for Searching Reddit
 */
export async function search_reddit(args) {
    const { query } = args;

    // Node 1: Input Validation
    logDebug(`[DEBUG] Node 1: Validating Reddit search query...`);
    if (!query) {
        return { error: "Missing required parameter 'query'." };
    }

    const url = `https://old.reddit.com/search?q=${encodeURIComponent(query)}&sort=relevance&t=month`;

    logDebug(`[DEBUG] Node 2: Attempting to scrape Reddit search ${url}`);

    try {
        // Node 2: Scrape via web-scraper
        const scrapeResult = await read_webpage({ url });

        if (scrapeResult && typeof scrapeResult.result === 'string' && scrapeResult.result.length > 50) {
            logDebug(`[DEBUG] Node 3: Scrape successful.`);
            return {
                source: "old.reddit.com search via web-scraper",
                query: query,
                content: scrapeResult.result.substring(0, 8000)
            };
        } else {
            throw new Error("Scraper returned empty or blocked content.");
        }

    } catch (e) {
        logDebugError(`[DEBUG] Node 2 Error: Scraping failed -> ${e.message}`);
        logDebug(`[DEBUG] Node 4: Executing Fallback (DuckDuckGo Search)`);

        try {
            const fallbackResult = await web_search({ query: `site:reddit.com ${query}` });
            return {
                warning: "Direct scraping was blocked. Returning DuckDuckGo search results instead.",
                source: "DuckDuckGo (Fallback)",
                results: fallbackResult
            };
        } catch (fallbackError) {
            return {
                error: `Search failed entirely: ${fallbackError.message}`
            };
        }
    }
}
