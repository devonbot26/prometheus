import { chat } from '../core/llm.js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from prometheus.env if it exists, otherwise .env
if (fs.existsSync('prometheus.env')) {
    dotenv.config({ path: 'prometheus.env', override: true });
} else {
    dotenv.config({ override: true });
}

async function testOpenAI() {
    console.log("🚀 Testing OpenAI API Integration...");
    console.log(`📡 Base URL: ${process.env.OPENAI_BASE_URL}`);

    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello! Who are you and where are you running?' }
    ];

    // 1. Test Standard (Non-streaming)
    console.log("\n--- TEST: Standard Response ---");
    try {
        const response = await chat(messages, { 
            forceModel: 'openai', 
            modelId: process.env.LLM_MODEL || 'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit'
        });
        console.log("✅ Received Response:");
        console.log(response.text);
        console.log(`📊 Stats: ${response.tps} tps, TTFT: ${response.ttft}ms`);
    } catch (e) {
        console.error("❌ Standard Test Failed:", e.message);
    }

    // 2. Test Streaming
    console.log("\n--- TEST: Streaming Response ---");
    try {
        let fullText = "";
        const response = await chat(messages, { 
            forceModel: 'openai', 
            modelId: process.env.LLM_MODEL || 'Jackrong/MLX-Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-4bit',
            onToken: (token) => {
                fullText += token;
            }
        });
        console.log("\n✅ Streaming Complete.");
        console.log(`📊 Stats: ${response.tps} tps, TTFT: ${response.ttft}ms`);
    } catch (e) {
        console.error("❌ Streaming Test Failed:", e.message);
    }
}

testOpenAI().catch(console.error);
