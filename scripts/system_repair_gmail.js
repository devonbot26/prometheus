#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';

console.log('🛠️ Prometheus System Repair: Gmail Authentication');
console.log('-----------------------------------------------');

try {
    // This script acts as a shortcut to the setup process
    const setupScript = path.join(process.cwd(), 'scripts', 'setup_gmail.js');
    console.log('🔄 Launching Gmail Setup Flow...');

    // We use inherit to let the user interact with the setup script
    execSync(`node ${setupScript}`, { stdio: 'inherit' });

} catch (e) {
    console.error('❌ Repair failed:', e.message);
    process.exit(1);
}
