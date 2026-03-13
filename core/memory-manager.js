import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = path.join(__dirname, '../.prometheus/MEMORIES.json');
const ARCHIVE_DIR = path.join(__dirname, '../.prometheus/archive');

// Ensure directory exists
if (!fs.existsSync(path.dirname(MEMORY_PATH))) {
    fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
}
if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

// Obsidian Vault Integration
const OBSIDIAN_VAULT = path.join(process.env.HOME, 'Documents/Obsidian/My iMac notebooks');
const PROMETHEUS_BRAIN = path.join(OBSIDIAN_VAULT, 'Prometheus_Brain');

if (fs.existsSync(OBSIDIAN_VAULT) && !fs.existsSync(PROMETHEUS_BRAIN)) {
    fs.mkdirSync(PROMETHEUS_BRAIN, { recursive: true });
}

/**
 * Core utility for managing Prometheus's long-term hierarchical memory.
 */
export class MemoryManager {
    constructor() {
        this.memories = [];
        this.load();
    }

    load() {
        if (fs.existsSync(MEMORY_PATH)) {
            try {
                this.memories = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf-8'));
            } catch (e) {
                console.error('❌ Error loading MEMORIES.json:', e.message);
                this.memories = [];
            }
        }
    }

    save() {
        try {
            fs.writeFileSync(MEMORY_PATH, JSON.stringify(this.memories, null, 2));
        } catch (e) {
            console.error('❌ Error saving MEMORIES.json:', e.message);
        }
    }

    /**
     * Add a new memory with deduplication.
     */
    addMemory(topic, fact, tags = []) {
        // 1. Generate hash for deduplication
        const hash = crypto.createHash('md5').update(fact.toLowerCase().trim()).digest('hex');
        
        // 2. Check for duplicate
        if (this.memories.some(m => m.hash === hash)) {
            return false; // Already exists
        }

        // 3. Create object
        const memory = {
            id: `mem_${crypto.randomBytes(3).toString('hex')}`,
            timestamp: new Date().toISOString(),
            topic,
            fact,
            tags: Array.from(new Set([...tags, topic.toLowerCase()])),
            hash
        };

        this.memories.push(memory);
        this.save();
        this.syncToObsidian(memory);
        return true;
    }

    /**
     * Mirror memory to Obsidian for human readability.
     */
    syncToObsidian(memory) {
        if (!fs.existsSync(PROMETHEUS_BRAIN)) return;

        const date = new Date(memory.timestamp);
        const yyyymm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const obsidianPath = path.join(PROMETHEUS_BRAIN, `memories_${yyyymm}.md`);

        const entry = `\n### [${memory.timestamp}] ${memory.topic}\n- **Fact:** ${memory.fact}\n- **Tags:** ${memory.tags.join(', ')}\n- **ID:** \`${memory.id}\`\n---\n`;

        try {
            if (!fs.existsSync(obsidianPath)) {
                fs.writeFileSync(obsidianPath, `# Prometheus Memories - ${yyyymm}\n\nThis file is managed by the Prometheus Memory System. Do not edit structure manually.\n`, 'utf8');
            }
            fs.appendFileSync(obsidianPath, entry, 'utf8');
        } catch (e) {
            console.error('❌ Error syncing to Obsidian:', e.message);
        }
    }

    /**
     * Retrieve top relevant memories based on keyword matching and temporal scoring.
     */
    getTopMemoriesForContext(query, maxTokens = 400) {
        if (!query) return [];
        const cleanQuery = query.toLowerCase();

        // 1. Filter by keyword/tag relevance
        const relevant = this.memories.filter(m => {
            return m.tags.some(tag => cleanQuery.includes(tag.toLowerCase())) ||
                   m.topic.toLowerCase().includes(cleanQuery) ||
                   m.fact.toLowerCase().includes(cleanQuery);
        });

        if (relevant.length === 0) return [];

        // 2. Apply Temporal Scoring
        const now = Date.now();
        const scored = relevant.map(m => {
            const ageMs = now - new Date(m.timestamp).getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            
            let score = 1;
            if (ageDays < 1) score = 9;
            else if (ageDays < 3) score = 7;
            else if (ageDays < 7) score = 5;
            else if (ageDays < 30) score = 3;

            return { ...m, score, ageDays };
        });

        // 3. Sort by score (desc) then by recency
        scored.sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));

        // 4. Return top 5 or until token cap (approx 80 tokens per memory)
        return scored.slice(0, 5);
    }

    /**
     * Move old memories to archive.
     */
    rotateArchives() {
        const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
        const toArchive = this.memories.filter(m => new Date(m.timestamp).getTime() < sixtyDaysAgo);
        
        if (toArchive.length === 0) return;

        const year = new Date().getFullYear();
        const archivePath = path.join(ARCHIVE_DIR, `MEMORIES_ARCHIVE_${year}.json`);
        
        let existingArchive = [];
        if (fs.existsSync(archivePath)) {
            try {
                existingArchive = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
            } catch (e) {}
        }

        const newArchive = [...existingArchive, ...toArchive];
        fs.writeFileSync(archivePath, JSON.stringify(newArchive, null, 2));

        // Update active memories
        this.memories = this.memories.filter(m => new Date(m.timestamp).getTime() >= sixtyDaysAgo);
        this.save();
    }
}

export const memoryManager = new MemoryManager();
