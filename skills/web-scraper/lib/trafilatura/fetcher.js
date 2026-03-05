import { ofetch } from 'ofetch';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * Fetcher class to handle HTTP requests with a Puppeteer fallback for SPAs.
 */
export class Fetcher {
    constructor(options = {}) {
        this.timeout = options.timeout || 8000;
        this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    async fetch(url) {
        try {
            console.log(`📡 [Fetcher] Attempting fast fetch: ${url}`);
            const response = await ofetch(url, {
                headers: { 'User-Agent': this.userAgent },
                timeout: this.timeout,
                retry: 0
            });

            // Check if it's a blank SPA shell (heuristic: very short body with a root div)
            if (this.isSPAShell(response)) {
                console.log(`⚠️ [Fetcher] Detected potential SPA, falling back to Puppeteer...`);
                return await this.fetchWithPuppeteer(url);
            }

            return response;
        } catch (error) {
            console.error(`❌ [Fetcher] Fast fetch failed: ${error.message}`);

            // If it's a 403 or other block, try Puppeteer as a last resort
            if (error.status === 403 || error.status === 401) {
                console.log(`🛡️ [Fetcher] Blocked (HTTP ${error.status}), attempting Puppeteer bypass...`);
                return await this.fetchWithPuppeteer(url);
            }

            throw error;
        }
    }

    isSPAShell(html) {
        if (typeof html !== 'string') return false;
        const low = html.toLowerCase();
        // Look for common SPA mounting points with very little other content
        const hasRoot = low.includes('id="root"') || low.includes('id="app"');
        return hasRoot && html.length < 2000;
    }

    async fetchWithPuppeteer(url) {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent(this.userAgent);

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: this.timeout * 2 // Give Puppeteer more time 
            });

            const content = await page.content();
            console.log(`✅ [Fetcher] Puppeteer extraction successful (${content.length} chars).`);
            return content;
        } catch (error) {
            console.error(`❌ [Fetcher] Puppeteer fallback failed: ${error.message}`);
            if (error.message.includes('timeout')) {
                return { error: "Site timed out, try another link." };
            }
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }
}
