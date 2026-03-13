import { Agent } from '../core/agent.js';
import fs from 'fs';
import path from 'path';

async function verifyTaskGuard() {
    console.log("🧪 Verifying Email Watcher Task Guard...");
    const agent = new Agent();

    // Case 1: Idle
    console.log("Case 1 (Idle): isBusy =", agent.isBusy());

    // Case 2: Turn Processing
    agent.processing = true;
    console.log("Case 2 (Processing): isBusy =", agent.isBusy());
    agent.processing = false;

    // Case 3: Mode Lock
    agent.activeMode = 'team-coder';
    console.log("Case 3 (Mode: team-coder): isBusy =", agent.isBusy());

    // Case 4: PM Status Lock
    agent.activeMode = 'team-manager';
    const pmStatePath = path.resolve(process.cwd(), 'PM_STATE.json');
    let originalState = '{}';
    if (fs.existsSync(pmStatePath)) {
        originalState = fs.readFileSync(pmStatePath, 'utf8');
    }

    // Mock pending steps
    const pendingState = { steps: [{ status: 'pending' }] };
    fs.writeFileSync(pmStatePath, JSON.stringify(pendingState));
    console.log("Case 4 (PM with pending steps): isBusy =", agent.isBusy());

    // Case 5: Failure Bypass
    const symptomsPath = path.resolve(process.cwd(), 'SYMPTOMS.md');
    fs.writeFileSync(symptomsPath, "# Failure");
    console.log("Case 5 (Failure state with SYMPTOMS.md): isBusy =", agent.isBusy());

    // Cleanup
    fs.writeFileSync(pmStatePath, originalState);
    if (fs.existsSync(symptomsPath)) fs.unlinkSync(symptomsPath);

    console.log("\n✅ Verification complete.");
}

verifyTaskGuard();
