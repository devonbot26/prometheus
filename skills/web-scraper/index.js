import Trafilatura from './lib/trafilatura/index.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use same stealth as js-trafilatura fetcher
puppeteer.use(StealthPlugin());

const trafilatura = new Trafilatura({
    timeout: 10000,
    chunkThreshold: 6000
});

/**
 * 📄 READ_ARTICLE (Trafilatura Engine)
 * Best for: Blogs, News, Documentation, Wiki pages.
 * Features: Ad-stripping, Metadata, GFM Tables, Token Squashing.
 */
export async function read_article(args) {
    const { url } = args;
    if (!url) return { error: "Missing required argument 'url'." };

    console.log(`\n📄 [Web-Scraper] Reading article: ${url}`);

    try {
        const result = await trafilatura.extract(url);

        if (result.error) {
            return { error: result.error };
        }

        return {
            result: `--- Article: ${result.metadata.title} ---\n\n${result.markdown}`,
            metadata: result.metadata,
            chunks: result.chunks
        };
    } catch (error) {
        return { error: `Failed to extract article: ${error.message}` };
    }
}

/**
 * 🕸️ READ_WEBPAGE (Raw Puppeteer)
 * Best for: Complex SPAs, Social Media (Twitter/FB), Login-protected pages.
 * Features: Full JS Rendering, Waits for network idle.
 */
export async function read_webpage(args) {
    const { url } = args;
    if (!url) return { error: "Missing required argument 'url'." };

    console.log(`\n🕸️ [Web-Scraper] Deep render: ${url}`);
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const html = await page.content();

        // Use Trafilatura's internal DOM scrubber and Markdown formatter even for raw pages
        const scrubbed = trafilatura.dom.scrub(html);
        const markdown = trafilatura.markdown.format(scrubbed);

        return {
            result: `--- Rendered Page: ${url} ---\n\n${trafilatura.tokenizer.squashTokens(markdown)}`
        };
    } catch (error) {
        return { error: `Failed to render page: ${error.message}` };
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * 🕷️ CRAWL_SITE (Spider Engine)
 * Best for: Discovering multiple pages via Sitemap or RSS.
 */
export async function crawl_site(args) {
    const { url, maxPages = 5 } = args;
    if (!url) return { error: "Missing URL." };

    console.log(`\n🕷️ [Web-Scraper] Crawling site: ${url}`);
    try {
        const results = await trafilatura.crawl(url);
        const summary = results.map(r => `- [${r.metadata.title}](${r.metadata.url})`).join('\n');

        return {
            result: `--- Discovered Pages from ${url} ---\n${summary}`,
            pages: results
        };
    } catch (error) {
        return { error: `Crawl failed: ${error.message}` };
    }
}
