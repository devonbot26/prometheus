import pkgSitemap from 'sitemap-stream';
const { SitemapStream, streamToPromise } = pkgSitemap;
import Parser from 'rss-parser';
import { ofetch } from 'ofetch';
import { JSDOM } from 'jsdom';

/**
 * Utility for parsing Sitemaps and RSS feeds.
 */
export class SitemapParser {
    constructor() {
        this.rssParser = new Parser();
    }

    /**
     * Discovers all URLs from a sitemap.xml or RSS feed.
     */
    async discover(url) {
        console.log(`🔍 [SitemapParser] Discovering URLs from: ${url}`);
        try {
            if (url.endsWith('.xml') || url.includes('sitemap')) {
                return await this.parseSitemap(url);
            } else if (url.includes('rss') || url.includes('feed')) {
                return await this.parseRSS(url);
            } else {
                // Fallback: check robots.txt or look for <link> tags in HTML
                return await this.discoverFromHTML(url);
            }
        } catch (error) {
            console.error(`❌ [SitemapParser] Discovery failed:`, error.message);
            return [];
        }
    }

    async parseSitemap(url) {
        const xml = await ofetch(url);
        // Simple regex-based extraction for robustness across different sitemap formats
        const urls = [];
        const matches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
        for (const match of matches) {
            urls.push(match[1]);
        }
        return [...new Set(urls)];
    }

    async parseRSS(url) {
        const feed = await this.rssParser.parseURL(url);
        return feed.items.map(item => item.link).filter(Boolean);
    }

    async discoverFromHTML(url) {
        const html = await ofetch(url);
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const urls = [];

        // Look for alternate links
        const alternates = doc.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"]');
        for (const link of alternates) {
            const href = link.getAttribute('href');
            if (href) {
                const absolute = new URL(href, url).href;
                const discovered = await this.discover(absolute);
                urls.push(...discovered);
            }
        }

        return [...new Set(urls)];
    }
}
