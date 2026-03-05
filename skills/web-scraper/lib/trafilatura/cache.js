import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * SQLite-based cache for js-trafilatura.
 */
export class CacheManager {
    constructor(options = {}) {
        const cacheDir = options.cacheDir || path.join(process.cwd(), '.cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const dbPath = path.join(cacheDir, 'trafilatura_cache.db');
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS scraper_cache (
                url_hash TEXT PRIMARY KEY,
                url TEXT,
                metadata TEXT,
                markdown TEXT,
                timestamp INTEGER
            )
        `);
        // Cleanup old entries (older than 7 days)
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.db.prepare('DELETE FROM scraper_cache WHERE timestamp < ?').run(weekAgo);
    }

    hashUrl(url) {
        return crypto.createHash('sha256').update(url).digest('hex');
    }

    get(url) {
        const hash = this.hashUrl(url);
        const row = this.db.prepare('SELECT * FROM scraper_cache WHERE url_hash = ?').get(hash);
        if (row) {
            return {
                metadata: JSON.parse(row.metadata),
                markdown: row.markdown,
                timestamp: row.timestamp,
                fromCache: true
            };
        }
        return null;
    }

    set(url, metadata, markdown) {
        const hash = this.hashUrl(url);
        const timestamp = Date.now();
        this.db.prepare(`
            INSERT OR REPLACE INTO scraper_cache (url_hash, url, metadata, markdown, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `).run(hash, url, JSON.stringify(metadata), markdown, timestamp);
    }

    clear() {
        this.db.prepare('DELETE FROM scraper_cache').run();
    }
}
