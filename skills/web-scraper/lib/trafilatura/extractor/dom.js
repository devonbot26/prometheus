import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

/**
 * DOM Utility for scrubbing and preparing HTML.
 */
export class DOMManager {
    constructor() {
        this.domPurify = createDOMPurify(new JSDOM('').window);
    }

    /**
     * Cleans the HTML of scripts, styles, and other noise.
     */
    scrub(html) {
        // Use JSDOM first to prune the actual DOM trees of noise
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const title = doc.title || "";

        // Forcefully remove noise elements and their children from the body
        const noiseNodes = doc.querySelectorAll('script, style, nav, footer, aside, header, .ads, .sidebar, .menu, noscript, svg');
        noiseNodes.forEach(n => n.remove());

        // Sanitize the body HTML specifically
        const sanitizedBody = this.domPurify.sanitize(doc.body.innerHTML, {
            ALLOWED_TAGS: [
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'i', 'u', 'a',
                'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'table',
                'thead', 'tbody', 'tr', 'th', 'td', 'img'
            ],
            KEEP_CONTENT: true
        });

        // Re-assemble a clean document with the original title
        return `<html><head><title>${title}</title></head><body>${sanitizedBody}</body></html>`;
    }

    /**
     * Creates a fresh JSDOM instance for Readability.
     */
    createDocument(html, url) {
        return new JSDOM(html, { url }).window.document;
    }
}
