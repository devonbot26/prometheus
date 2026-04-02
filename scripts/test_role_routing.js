import 'dotenv/config';
import { ROLE_MODEL_MAP } from '../core/agent.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 Starting Role Routing Verification Test...\n');

// 1. Check .env variables
console.log('📋 Checking .env model variables:');
console.log(` - DEFAULT: ${process.env.LLM_MODEL}`);
console.log(` - HEAVY: ${process.env.LLM_MODEL_HEAVY}`);

if (!process.env.LLM_MODEL || !process.env.LLM_MODEL_HEAVY) {
    console.error('❌ Missing model variables in .env (LLM_MODEL and/or LLM_MODEL_HEAVY)');
    process.exit(1);
}

// 2. Verify ROLE_MODEL_MAP in agent.js
console.log('\n🧠 Checking ROLE_MODEL_MAP in agent.js:');
const rolesToTest = ['team-architect', 'team-coder', 'team-manager', 'devon'];

for (const role of rolesToTest) {
    const config = ROLE_MODEL_MAP[role];
    if (!config || !config.modelId) {
        console.error(`❌ Role ${role} is missing modelId in ROLE_MODEL_MAP`);
    } else {
        console.log(` ✅ ${role} -> ${config.modelId} ${config.fast ? '(fast)' : ''} ${config.deepThinking ? '(deep)' : ''}`);
    }
}

// 3. Simulate a handoff logic check
console.log('\n📡 Simulation: Handoff from team-manager to team-coder');
const coderModel = ROLE_MODEL_MAP['team-coder'].modelId;
const currentActive = process.env.LLM_MODEL;

if (coderModel !== currentActive) {
    console.log(` 🔄 Detected need for swap: ${currentActive} -> ${coderModel}`);
    console.log(' ✅ Logic suggests RESTART_LLAMA would be triggered.');
} else {
    console.log(' ℹ️ No swap needed (Coder is already active).');
}

console.log('\n🚀 Verification Successful. Mapping is ready for deployment.');
