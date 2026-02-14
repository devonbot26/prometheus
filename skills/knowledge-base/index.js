/**
 * Knowledge Base (RAG) Skill
 * Uses local vector search to store and retrieve long-term memory.
 */

import { LocalIndex } from 'vectra';
import { pipeline } from '@xenova/transformers';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
        console.error('Save error:', e);
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
        console.error('Query error:', e);
        return { error: e.message };
    }
}
