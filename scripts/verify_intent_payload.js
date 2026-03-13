import { resolveIntent } from '../core/decision-tree.js';
import assert from 'assert';

console.log('🧪 Starting Intent Payload Verification...');

const skills = new Set(['terminal', 'sys-admin', 'gmail', 'github']);
const prompt = "check my github PRs and list files";
const history = "";

const result = resolveIntent(prompt, history, skills);

console.log('1. Testing resolveIntent return structure...');
assert.ok(result.skills, 'Result should have skills array');
assert.ok(result.debug, 'Result should have debug object');
assert.ok(Array.isArray(result.debug.ranked), 'debug.ranked should be an array');
assert.ok(result.debug.matchedKeywords, 'debug.matchedKeywords should exist');

console.log('2. Testing actual score accuracy for prompt: ' + prompt);
const githubScore = result.debug.ranked.find(r => r[0] === 'github')?.[1] || 0;
const terminalScore = result.debug.ranked.find(r => r[0] === 'terminal')?.[1] || 0;

console.log(`   - GitHub Score: ${githubScore}`);
console.log(`   - Terminal Score: ${terminalScore}`);

assert.ok(githubScore > 0, 'GitHub should have a positive score');
assert.ok(terminalScore > 0, 'Terminal should have a positive score');

console.log('3. Testing keyword extraction...');
assert.ok(result.debug.matchedKeywords.github.triggers.includes('github'), 'Matched keywords should include "github"');
assert.ok(result.debug.matchedKeywords.terminal.triggers.includes('list files'), 'Matched keywords should include "list files"');

console.log('✅ Intent Payload Verification: PASS');
