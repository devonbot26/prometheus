import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const modelId = process.env.LLM_MODEL;
const testName = process.argv[2] || 'Generic Test';

const reasoningPrompt = `
You are an expert systems architect.
TASK: Explain the potential race condition when using a Node.js process manager that kills a child process based on port availability alone. 
Include a specific scenario involving 'TIME_WAIT' sockets and PID recycling.
REQUIRED: Use <think> tags for your reasoning process.
`;

async function runBenchmark() {
    console.log(`🚀 Benchmarking Model: ${modelId} (${testName})`);
    
    const startTime = Date.now();
    let firstTokenTime = null;
    let totalTokens = 0;
    let fullResponse = "";

    try {
        const response = await fetch('http://127.0.0.1:18888/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: reasoningPrompt }],
                temperature: 0.2,
                max_tokens: 1000,
                stream: true // We use streaming to measure TTFT and TPS accurately
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const stream = response.body;
        for await (const chunk of stream) {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    const data = JSON.parse(line.slice(6));
                    const content = data.choices[0]?.delta?.content || "";
                    if (content) {
                        if (!firstTokenTime) firstTokenTime = Date.now();
                        fullResponse += content;
                        totalTokens++; // Approximate token count by counting chunks if necessary, but mlx usually sends token-by-token
                    }
                }
            }
        }

        const endTime = Date.now();
        const totalTimeS = (endTime - startTime) / 1000;
        const ttftS = firstTokenTime ? (firstTokenTime - startTime) / 1000 : null;
        const generationTimeS = firstTokenTime ? (endTime - firstTokenTime) / 1000 : 0;
        const tps = totalTokens / generationTimeS;

        const result = {
            testName,
            modelId,
            ttftS,
            tps: tps.toFixed(2),
            totalTokens,
            totalTimeS: totalTimeS.toFixed(2),
            responseSnippet: fullResponse.substring(0, 500) + "...",
            hasReasoning: fullResponse.includes('<think>') || fullResponse.includes('<reasoning>')
        };

        console.log(`✅ Results: TPS: ${result.tps}, TTFT: ${result.ttftS}s, Reasoning: ${result.hasReasoning}`);
        
        const resultsPath = path.join(process.cwd(), 'benchmark_results.json');
        let allResults = [];
        if (fs.existsSync(resultsPath)) {
            allResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        }
        allResults.push(result);
        fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));

    } catch (error) {
        console.error(`❌ Benchmark failed: ${error.message}`);
    }
}

runBenchmark();
