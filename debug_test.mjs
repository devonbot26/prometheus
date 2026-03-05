import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const vaultPath = '/Users/nelsonwong/Documents/Obsidian/My iMac notebooks';
try {
    const results = execSync(`grep -rl "original_path:" "${vaultPath}" --include="*.md"`, { encoding: 'utf-8' });
    const files = results.split('\n').filter(p => p.trim());
    console.log("FILES FOUND:", JSON.stringify(files));
    
    for (const file of files) {
        console.log("Checking:", file, "Exists:", fs.existsSync(file));
        const content = fs.readFileSync(file, 'utf-8');
        const match = content.match(/^original_path:\s*(.+)$/m);
        if (match) console.log("Match:", match[1]);
    }
} catch (e) {
    console.log("GREP ERROR:", e.message);
}
