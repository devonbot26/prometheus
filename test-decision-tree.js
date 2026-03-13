// test-decision-tree.js
import { resolveIntent } from './core/decision-tree.js';

// Mock available skills Set
const availableSkills = new Set([
    'gmail', 'web-search', 'terminal', 'knowledge-base',
    'self-coder', 'obsidian', 'team-manager'
]);

// Test 1: Ambiguous code search query
const msg1 = "can you find that script we wrote yesterday and fix the bug in it?";
const res1 = resolveIntent(msg1, "", availableSkills);
console.log(`Test 1 (Coding/Search): ${msg1}`);
console.log(`Expected: self-coder, terminal`);
console.log(`Actual:   ${res1.join(', ')}\n`);

// Test 2: Clear email query
const msg2 = "read my latest email in gmail and reply to it";
const res2 = resolveIntent(msg2, "", availableSkills);
console.log(`Test 2 (Email): ${msg2}`);
console.log(`Expected: gmail`);
console.log(`Actual:   ${res2.join(', ')}\n`);

// Test 3: No strong intent, but mentions files
const msg3 = "what is the path to the config file?";
const res3 = resolveIntent(msg3, "", availableSkills);
console.log(`Test 3 (Files - Fallback): ${msg3}`);
console.log(`Expected: terminal`);
console.log(`Actual:   ${res3.join(', ')}\n`);
