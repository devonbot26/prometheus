import { handoff_to } from './skills/team-manager/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTest() {
    console.log("=== Testing Handoff from PM to Coder ===");
    // Simulate PM handing off
    let result = await handoff_to({
        role: "coder",
        context: "Please write the auth module",
        _caller_role: "team-manager"
    });
    
    console.log("PM Handoff Result:", result);
    let handoffData = JSON.parse(fs.readFileSync(path.join(__dirname, 'HANDOFF.json'), 'utf-8'));
    console.log("HANDOFF.json:", handoffData);
    
    console.log("\n=== Testing Handoff from Coder back to PM ===");
    // Simulate Coder handing off back to PM
    result = await handoff_to({
        role: "team-manager",
        context: "Auth module written and verified.",
        _caller_role: "team-coder"
    });
    
    console.log("Coder Handoff Result:", result);
    handoffData = JSON.parse(fs.readFileSync(path.join(__dirname, 'HANDOFF.json'), 'utf-8'));
    console.log("HANDOFF.json:", handoffData);
    
    console.log("\n=== Testing Handoff from PM BACK TO Coder (Rejection) ===");
    result = await handoff_to({
        role: "coder",
        context: "This code failed tests. Please fix it.",
        _caller_role: "team-manager" // The PM is doing the handoff
    });
    
    console.log("PM Rejection Handoff Result:", result);
    handoffData = JSON.parse(fs.readFileSync(path.join(__dirname, 'HANDOFF.json'), 'utf-8'));
    console.log("HANDOFF.json:", handoffData);
}

runTest();
