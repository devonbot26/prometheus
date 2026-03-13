import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

let browser = null;
let page = null;

/**
 * Ensures a browser and page instance are available.
 */
async function ensureSession() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: false, // Set to false to see the 'Self-Evolution' in action
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const pages = await browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
    }
    return { browser, page };
}

/**
 * Open a URL
 */
export async function browser_open({ url }) {
    const { page } = await ensureSession();
    console.log(`[BROWSER] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Get a summary of the page for the LLM
    const title = await page.title();
    return {
        success: true,
        title,
        status: "Page loaded. Ready for interaction."
    };
}

/**
 * Click an element
 */
export async function browser_click({ selector }) {
    const { page } = await ensureSession();
    console.log(`[BROWSER] Clicking: ${selector}`);

    try {
        // Try as CSS selector first
        await page.click(selector);
    } catch (e) {
        // Fallback: search for text if it looks like a label
        const [handle] = await page.$x(`//button[contains(., '${selector}')] | //a[contains(., '${selector}')]`);
        if (handle) {
            await handle.click();
        } else {
            throw new Error(`Selector/Text not found: ${selector}`);
        }
    }

    return { success: true, action: `Clicked ${selector}` };
}

/**
 * Type text
 */
export async function browser_type({ selector, text, pressEnter = false }) {
    const { page } = await ensureSession();
    console.log(`[BROWSER] Typing into ${selector}...`);

    await page.type(selector, text, { delay: 50 });
    if (pressEnter) {
        await page.keyboard.press('Enter');
    }

    return { success: true, action: `Typed text into ${selector}` };
}

/**
 * Wait for element
 */
export async function browser_wait({ selector, timeout = 5000 }) {
    const { page } = await ensureSession();
    await page.waitForSelector(selector, { timeout });
    return { success: true, status: `Element ${selector} appeared.` };
}

/**
 * Take a screenshot
 */
export async function browser_screenshot({ fileName = null }) {
    const { page } = await ensureSession();
    const name = fileName || `screenshot_${Date.now()}.png`;
    const screenshotDir = path.join(process.cwd(), 'data', 'screenshots');

    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const filePath = path.join(screenshotDir, name);
    await page.screenshot({ path: filePath });

    console.log(`[BROWSER] Screenshot saved: ${filePath}`);
    return {
        success: true,
        message: `Screenshot saved to data/screenshots/${name}`,
        path: filePath
    };
}

/**
 * Extract text from page
 */
export async function browser_extract_text({ selector = 'body' }) {
    const { page } = await ensureSession();
    console.log(`[BROWSER] Extracting text from ${selector}...`);

    const text = await page.$eval(selector, el => el.innerText);
    return { success: true, text: text.substring(0, 5000) }; // Truncate for LLM window
}

/**
 * Close browser
 */
export async function browser_close() {
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
        return { success: true, status: "Browser closed." };
    }
    return { success: false, status: "No active browser session." };
}
