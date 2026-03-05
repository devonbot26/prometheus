import { audit_vault_structure, revert_librarian_action } from './skills/obsidian-librarian/index.js';
import fs from 'fs';

async function run() {
    const vaultPath = '/Users/nelsonwong/Documents/Obsidian/My iMac notebooks';
    console.log("--- RUNNING AUDIT ---");
    const auditRes = await audit_vault_structure({ vault_path: vaultPath });
    console.log("Audit Result:", auditRes);

    // Check if test_system_file_audit.md was ignored
    console.log("System file still in root?", fs.existsSync('/Users/nelsonwong/Documents/Obsidian/My iMac notebooks/test_system_file_audit.md'));
    console.log("Loose file in Inbox?", fs.existsSync('/Users/nelsonwong/Documents/Obsidian/My iMac notebooks/00_Inbox/test_loose_file_rollback_audit.md'));

    // Simulate failure by deleting JSON log
    const logPath = '/Users/nelsonwong/Documents/Obsidian/My iMac notebooks/.prometheus/librarian_rollback.json';
    if (fs.existsSync(logPath)) {
        console.log("Deleting JSON log to simulate failure...");
        fs.unlinkSync(logPath);
    }

    // Now trigger revert to ensure property fallback works
    console.log("--- RUNNING REVERT ---");
    const revertRes = await revert_librarian_action({ vault_path: vaultPath });
    console.log("Revert Result:", revertRes);

    // Verify loose file is back in root
    console.log("Loose file restored to root?", fs.existsSync('/Users/nelsonwong/Documents/Obsidian/My iMac notebooks/test_loose_file_rollback_audit.md'));
}
run();
