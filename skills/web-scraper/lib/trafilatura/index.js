import { Fetcher } from './fetcher.js';
import { DOMManager } from './extractor/dom.js';
import { ContentExtractor } from './extractor/content.js';
import { MetadataExtractor } from './extractor/metadata.js';
import { MarkdownFormatter } from './formatters/markdown.js';
import { Tokenizer } from './formatters/tokenizer.js';
import { CacheManager } from './cache.js';
import { Crawler } from './spider/crawler.js';

/**
 * Main Trafilatura class for Node.js.
 */
export default class Trafilatura {
    constructor(options = {}) {
        this.fetcher = new Fetcher(options);
        this.dom = new DOMManager();
        this.content = new ContentExtractor();
        this.metadata = new MetadataExtractor();
        this.markdown = new MarkdownFormatter();
        this.tokenizer = new Tokenizer(options);
        this.cache = new CacheManager(options);
        this.crawler = new Crawler(this, options);
    }

    /**
     * Crawls a URL and its links.
     * @param {string} url 
     */
    async crawl(url) {
        return await this.crawler.crawl(url);
    }

    /**
     * Extracts clean content from a URL.
     * @param {string} url 
     */
    async extract(url) {
        try {
            // Check cache first
            const cached = this.cache.get(url);
            if (cached) {
                console.log(`🚀 [Trafilatura] Cache Hit: ${url}`);
                return {
                    ...cached,
                    chunks: this.tokenizer.paginate(cached.markdown)
                };
            }

            // 1. Fetch
            const html = await this.fetcher.fetch(url);
            if (html.error) return html; // Return timeout/error early

            // 2. Scrub & Prepare
            const scrubbedHtml = this.dom.scrub(html);

            // 3. Extract Metadata (from raw to ensure full context)
            const meta = await this.metadata.extract(html, url);

            // 4. Extract Content
            const article = this.content.extract(scrubbedHtml, url);

            // 5. Format to Markdown
            let md = this.markdown.format(article.content);

            // 6. LLM Token Ingestion Optimizations
            md = this.tokenizer.squashTokens(md);
            md = this.tokenizer.addFrontmatter(md, meta);

            // 7. Store in Cache
            this.cache.set(url, meta, md);

            // 8. Paginate for small context windows
            const chunks = this.tokenizer.paginate(md);

            return {
                metadata: meta,
                markdown: md,
                chunks: chunks,
                article: article
            };
        } catch (error) {
            console.error(`❌ [Trafilatura] Fatal error:`, error.message);
            return { error: `Fatal Error: ${error.message}` };
        }
    }
}
