/**
 * Knowledge Base (RAG) Skill
 * Uses local vector search to store and retrieve long-term memory.
 */

import { LocalIndex } from 'vectra';
import { pipeline } from '@xenova/transformers';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logDebugError } from '../../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, 'memory');

// Ensure memory folder exists
if (!fs.existsSync(INDEX_PATH)) {
    fs.mkdirSync(INDEX_PATH, { recursive: true });
}

let index = null;
let embedder = null;

async function getEmbedder() {
    if (!embedder) {
        console.log('🧠 Loading local embedding model (all-MiniLM-L6-v2)...');
        // Disable internet access for model loading if possible, or cache it.
        // Transformers.js caches models locally by default.
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return embedder;
}

async function getIndex() {
    if (!index) {
        index = new LocalIndex(INDEX_PATH);
        if (!await index.isIndexCreated()) {
            await index.createIndex();
        }
    }
    return index;
}

async function getEmbedding(text) {
    const pipe = await getEmbedder();
    const result = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
}

export async function save_knowledge(args) {
    const { text, topic } = args;
    if (!text) return { error: 'Text is required' };

    try {
        const vector = await getEmbedding(text);
        const idx = await getIndex();

        await idx.insertItem({
            vector,
            metadata: {
                text,
                topic: topic || 'General',
                timestamp: Date.now()
            }
        });

        console.log(`💾 Saved knowledge: "${topic ? `[${topic}] ` : ''}${text.substring(0, 50)}..."`);
        return { success: true, message: 'Knowledge saved to vector database.' };
    } catch (e) {
        logDebugError('Save error:', e);
        return { error: e.message };
    }
}

export async function query_knowledge(args) {
    const { query } = args;
    if (!query) return { error: 'Query is needed' };

    try {
        const vector = await getEmbedding(query);
        const idx = await getIndex();

        // Retrieve top 3 results
        const results = await idx.queryItems(vector, 3);

        if (results.length === 0) {
            return { found: false, message: 'No relevant knowledge found.' };
        }

        const data = results.map(item => ({
            topic: item.item.metadata.topic,
            text: item.item.metadata.text,
            score: item.score
        }));

        console.log(`🔍 Found ${data.length} memories for "${query}"`);
        return { found: true, results: data };
    } catch (e) {
        logDebugError('Query error:', e);
        return { error: e.message };
    }
}

export async function record_observation(args) {
    const { observation, type, concepts } = args;
    if (!observation) return { error: 'Observation text is required' };

    try {
        const text = `[${type.toUpperCase()}] Observation: ${observation}\nConcepts: ${concepts.join(', ')}`;
        const vector = await getEmbedding(text);
        const idx = await getIndex();

        await idx.insertItem({
            vector,
            metadata: {
                text,
                type,
                concepts,
                observation,
                timestamp: Date.now()
            }
        });

        console.log(`📓 Recorded ${type} observation: "${observation.substring(0, 50)}..."`);
        return { success: true, message: 'Observation recorded to long-term memory.' };
    } catch (e) {
        logDebugError('Observation error:', e);
        return { error: e.message };
    }
}

export async function update_project_timeline(args) {
    const { summary } = args;
    // Default to the project root
    const root = process.env.PROJECT_ROOT || process.cwd();
    const timelinePath = path.resolve(root, 'PROMETHEUS.md');

    try {
        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toLocaleTimeString();
        const entry = `\n### ${dateStr} ${timeStr}\n- **Summary**: ${summary}\n`;

        if (!fs.existsSync(timelinePath)) {
            const header = `# Prometheus Project Timeline\n\nThis file tracks the autonomous progress and milestones of the Prometheus AI Assistant.\n`;
            fs.writeFileSync(timelinePath, header + entry, 'utf-8');
        } else {
            fs.appendFileSync(timelinePath, entry, 'utf-8');
        }

        console.log(`📅 Updated project timeline: PROMETHEUS.md`);
        return { success: true, file: timelinePath };
    } catch (e) {
        logDebugError('Timeline error:', e);
        return { error: e.message };
    }
}
