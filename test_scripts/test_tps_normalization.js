// Standalone TPS Normalization Logic Test Logic

// Mocking the normalization logic from llm.js
function normalize(usage, durationS) {
    const completionTokens = usage.completion_tokens || usage.output_tokens || 0;
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const totalTokens = usage.total_tokens || (completionTokens + promptTokens);
    const tps = completionTokens > 0 && durationS > 0 ? (completionTokens / durationS).toFixed(1) : 0;

    return {
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
        tps: parseFloat(tps)
    };
}

// Test Case 1: Standard mlx_lm
const usage1 = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
const res1 = normalize(usage1, 2);
console.log('Test 1 (mlx_lm):', res1.tps === 10.0 ? 'PASS' : 'FAIL', res1);

// Test Case 2: mlx_vlm
const usage2 = { input_tokens: 15, output_tokens: 45 };
const res2 = normalize(usage2, 3);
console.log('Test 2 (mlx_vlm):', res2.tps === 15.0 ? 'PASS' : 'FAIL', res2);

// Test Case 3: Empty usage
const usage3 = {};
const res3 = normalize(usage3, 1);
console.log('Test 3 (Empty):', res3.tps === 0 ? 'PASS' : 'FAIL', res3);
