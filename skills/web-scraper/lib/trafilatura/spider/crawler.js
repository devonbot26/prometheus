import { SitemapParser } from './sitemap.js';

/**
 * Crawler for broad-site traversal and information gathering.
 */
export class Crawler {
    constructor(trafilatura, options = {}) {
        this.trafilatura = trafilatura;
        this.sitemap = new SitemapParser();
        this.maxDepth = options.maxDepth || 2;
        this.maxPages = options.maxPages || 20;
        this.visited = new Set();
        this.queue = [];
        this.results = [];
    }

    /**
     * Starts crawling a URL and its related links.
     */
    async crawl(url) {
        console.log(`🚀 [Crawler] Starting crawl: ${url}`);

        // 1. Try sitemap discovery first
        const sitemapUrls = await this.sitemap.discover(url);
        if (sitemapUrls.length > 0) {
            console.log(`✅ [Crawler] Discovered ${sitemapUrls.length} URLs from sitemaps.`);
            this.queue.push(...sitemapUrls.slice(0, this.maxPages));
        } else {
            this.queue.push(url);
        }

        // 2. Process Queue
        while (this.queue.length > 0 && this.visited.size < this.maxPages) {
            const currentUrl = this.queue.shift();
            if (this.visited.has(currentUrl)) continue;

            const result = await this.trafilatura.extract(currentUrl);
            if (!result.error) {
                this.results.push(result);
                this.visited.add(currentUrl);
            }
        }

        return this.results;
    }
}
