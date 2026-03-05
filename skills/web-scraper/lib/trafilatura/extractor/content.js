import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Wraps @mozilla/readability for article extraction.
 */
export class ContentExtractor {
    extract(html, url) {
        try {
            // Readability modifies the DOM, so we must work on a clone/fresh JSDOM
            const dom = new JSDOM(html, { url });
            const doc = dom.window.document;

            const reader = new Readability(doc, {
                charThreshold: 200, // Heuristic for short content
                nbTopCandidates: 5
            });

            const article = reader.parse();

            if (!article) {
                console.warn(`⚠️ [ContentExtractor] Readability failed to find an article. Returning textContent fallback.`);
                return {
                    title: "",
                    content: doc.body.textContent.trim(),
                    textContent: doc.body.textContent.trim(),
                    length: doc.body.textContent.length
                };
            }

            return article;
        } catch (error) {
            console.error(`❌ [ContentExtractor] Error parsing content:`, error.message);
            throw error;
        }
    }
}
