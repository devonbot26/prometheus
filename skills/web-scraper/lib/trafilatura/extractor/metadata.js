import metascraper from 'metascraper';
import metascraperAuthor from 'metascraper-author';
import metascraperDate from 'metascraper-date';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperLogo from 'metascraper-logo';
import metascraperPublisher from 'metascraper-publisher';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';

/**
 * Metadata extractor using a rule-based system (Metascraper).
 */
export class MetadataExtractor {
    constructor() {
        this.scraper = metascraper([
            metascraperAuthor(),
            metascraperDate(),
            metascraperDescription(),
            metascraperImage(),
            metascraperLogo(),
            metascraperPublisher(),
            metascraperTitle(),
            metascraperUrl()
        ]);
    }

    async extract(html, url) {
        try {
            const metadata = await this.scraper({ html, url });
            console.log(`✅ [MetadataExtractor] Fetched metadata for: ${metadata.title || "Unknown Title"}`);
            return metadata;
        } catch (error) {
            console.error(`❌ [MetadataExtractor] Error extracting metadata:`, error.message);
            return {};
        }
    }
}
