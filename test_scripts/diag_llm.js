import fetch from 'node-fetch';
import 'dotenv/config';

const LLM_MODEL = process.env.LLM_MODEL || "mlx-community/Qwen3.5-2B-MLX-4bit";
const LLM_MODEL_HEAVY = process.env.LLM_MODEL_HEAVY || "Jackrong/MLX-Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-4bit";

async function testServer(port, name, modelId) {
    console.log(`\n🔍 TESTING PORT ${port} (${name}) with model: ${modelId}...`);
    try {
        const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: "user", content: "hi" }],
                stream: true
            }),
            timeout: 10000
        });

        if (!res.ok) {
            console.error(`❌ Port ${port} returned ${res.status}`);
            const body = await res.text();
            console.error(`📄 Body: ${body.substring(0, 100)}`);
            return false;
        }

        console.log(`✅ Port ${port} connected. Reading stream...`);
        const reader = res.body;
        let receivedTokens = 0;
        let fullText = "";

        for await (const chunkBuffer of reader) {
            const chunk = chunkBuffer.toString();
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') break;
                    try {
                        const json = JSON.parse(dataStr);
                        const delta = json.choices[0].delta;
                        const text = delta.content || delta.text || "";
                        if (text) {
                            receivedTokens++;
                            fullText += text;
                        }
                    } catch (e) {}
                }
            }
        }

        if (receivedTokens > 0) {
            console.log(`✅ Port ${port} STREAMING SUCCESS!`);
            console.log(`📄 Response: "${fullText}"`);
            return true;
        } else {
            console.error(`❌ Port ${port} connected but returned 0 tokens.`);
            return false;
        }
    } catch (e) {
        console.error(`❌ Port ${port} connection failed: ${e.message}`);
        return false;
    }
}

async function run() {
    const fastOk = await testServer(18888, "2B FAST", LLM_MODEL);
    const heavyOk = await testServer(18889, "9B HEAVY", LLM_MODEL_HEAVY);
    
    console.log("\n--- FINAL REPORT ---");
    console.log(`2B Status: ${fastOk ? '✅ OK' : '❌ FAILED'}`);
    console.log(`9B Status: ${heavyOk ? '✅ OK' : '⚠️ OFFLINE'}`);
}

run();
