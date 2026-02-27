import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import TurndownService from 'turndown';

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

export async function read_webpage(args) {
    const { url } = args;
    if (!url) {
        return { error: "Missing required argument 'url'." };
    }

    console.log(`\n🕸️ [Web-Scraper] Navigating stealthily to: ${url}`);
    let browser;

    try {
        // Launch the stealth browser
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Wait until network is mostly idle to ensure JS framework rendered the DOM
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Extract the raw HTML of the body
        const bodyHTML = await page.evaluate(() => document.body.innerHTML);

        // Convert raw HTML into clean Markdown for the LLM
        const turndownService = new TurndownService({ headingStyle: 'atx' });

        // Remove scripts and styles before conversion
        turndownService.remove(['script', 'style', 'noscript', 'meta', 'link']);
        const markdownText = turndownService.turndown(bodyHTML);

        console.log(`✅ [Web-Scraper] Successfully extracted ${markdownText.length} characters of markdown.`);

        return {
            result: `--- Content of ${url} ---\n\n${markdownText}`
        };

    } catch (error) {
        console.error(`❌ [Web-Scraper] Error scraping ${url}:`, error.message);
        return { error: `Failed to scrape page: ${error.message}` };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
