import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Formatter for converting HTML to GitHub Flavored Markdown.
 */
export class MarkdownFormatter {
    constructor() {
        this.turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            emDelimiter: '*'
        });

        // Use GFM plugin for tables, task lists, strikethrough
        this.turndown.use(gfm);

        // Custom rule for technical preservations
        this.turndown.addRule('pre-code', {
            filter: ['pre'],
            replacement: (content, node) => {
                return '\n```' + (node.getAttribute('class') || '') + '\n' + content.trim() + '\n```\n';
            }
        });
    }

    /**
     * Formats HTML content into Markdown.
     */
    format(html) {
        if (!html) return "";
        try {
            return this.turndown.turndown(html);
        } catch (error) {
            console.error(`❌ [MarkdownFormatter] Conversion error:`, error.message);
            return html; // Fallback to raw HTML
        }
    }
}
