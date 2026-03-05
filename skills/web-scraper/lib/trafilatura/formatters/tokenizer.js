import YAML from 'yaml';

/**
 * Tokenizer utility for LLM ingestion optimization.
 */
export class Tokenizer {
    constructor(options = {}) {
        this.chunkThreshold = options.chunkThreshold || 6000; // Words approx
        this.stripHyperlinks = options.stripHyperlinks || false;
    }

    /**
     * Aggressively squashes whitespace and optional stripping of URLs.
     */
    squashTokens(markdown) {
        if (!markdown) return "";
        let result = markdown;

        // Strip Hyperlinks if requested (preserving link text)
        if (this.stripHyperlinks) {
            // Replaces [text](url) with just [text]
            result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1]');
        }

        // Squash multiple newlines (3+ to 2)
        result = result.replace(/\n{3,}/g, '\n\n');

        // Squash horizontal whitespace
        result = result.replace(/[ \t]{2,}/g, ' ');

        // Remove empty alt tags
        result = result.replace(/!\[\]\(([^)]+)\)/g, '');

        return result.trim();
    }

    /**
     * Flattens metadata into a clean YAML frontmatter block.
     */
    addFrontmatter(markdown, metadata) {
        const frontmatter = {
            title: metadata.title || "",
            author: metadata.author || "",
            date: metadata.date || "",
            source: metadata.url || "",
            site: metadata.publisher || ""
        };

        const yamlStr = YAML.stringify(frontmatter);
        return `---\n${yamlStr}---\n\n${markdown}`;
    }

    /**
     * Splits massive documents into manageable chunks.
     */
    paginate(markdown) {
        const words = markdown.split(/\s+/);
        if (words.length <= this.chunkThreshold) {
            return [markdown];
        }

        const chunks = [];
        for (let i = 0; i < words.length; i += this.chunkThreshold) {
            chunks.push(words.slice(i, i + this.chunkThreshold).join(' '));
        }

        return chunks;
    }
}
