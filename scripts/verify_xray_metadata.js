// Mock closure variables since they are inside Agent.process
let reasoning = '';
const cleanupAssistantText = (text, metadata = null) => {
    let processed = text;
    if (metadata) {
        metadata.raw = text;
        metadata.strips = [];
    }

    const BOILERPLATE = [
        /^(As an AI( model| assistant)?[\s,.]*)/i,
        /^(Here (is|are) the (results?|output|information|code|snippet|answer)[\s:.]*)/i,
        /^(Sure[\s!.,]*)/i,
        /^(Certainly[\s!.,]*)/i,
    ];

    let lines = processed.split('\n');
    let shifts = 0;
    while (lines.length > 0 && shifts < 5) {
        let matched = false;
        for (const regex of BOILERPLATE) {
            if (regex.test(lines[0])) {
                const matchedText = lines[0].match(regex)[0];
                if (metadata) metadata.strips.push(matchedText);
                lines[0] = lines[0].replace(regex, '').trim();
                if (!lines[0]) lines.shift();
                matched = true;
                shifts++;
                break;
            }
        }
        if (!matched) break;
    }
    processed = lines.join('\n');
    return processed.trim();
};

import assert from 'assert';

console.log('🧪 Starting X-Ray Metadata Verification...');

const testText = "Certainly! Sure! Here are the results:\nActual content here.";
let meta = { raw: '', strips: [] };
const result = cleanupAssistantText(testText, meta);

console.log('1. Testing cleaned output...');
assert.strictEqual(result, "Actual content here.", "Result should be fully cleaned");

console.log('2. Testing metadata capture...');
assert.strictEqual(meta.raw, testText, "Raw field should match original text");
assert.strictEqual(meta.strips.length, 3, "Should have captured 3 strips");
assert.ok(meta.strips.includes("Certainly! "), "Should include 'Certainly! '");
assert.ok(meta.strips.includes("Sure! "), "Should include 'Sure! '");
assert.ok(meta.strips.includes("Here are the results:"), "Should include boilerplate intro");

console.log('✅ X-Ray Metadata Verification: PASS');
