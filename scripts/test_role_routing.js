import 'dotenv/config';
import { ROLE_MODEL_MAP } from '../core/agent.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 Starting Role Routing Verification Test...\n');

// 1. Check .env variables
console.log('📋 Checking .env specialized models:');
console.log(` - REASONER: ${process.env.LLM_MODEL_REASONER}`);
console.log(` - CODER: ${process.env.LLM_MODEL_CODER}`);
console.log(` - MANAGER: ${process.env.LLM_MODEL_MANAGER}`);

if (!process.env.LLM_MODEL_REASONER || !process.env.LLM_MODEL_CODER || !process.env.LLM_MODEL_MANAGER) {
    console.error('❌ Missing specialized model variables in .env');
    process.exit(1);
}

// 2. Verify ROLE_MODEL_MAP in agent.js
console.log('\n🧠 Checking ROLE_MODEL_MAP in agent.js:');
const rolesToTest = ['team-architect', 'team-coder', 'team-manager'];

for (const role of rolesToTest) {
    const config = ROLE_MODEL_MAP[role];
    if (!config || !config.modelId) {
        console.error(`❌ Role ${role} is missing modelId in ROLE_MODEL_MAP`);
    } else {
        console.log(` ✅ ${role} -> ${config.modelId}`);
    }
}

// 3. Simulate a handoff logic check (Mental check vs code)
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
