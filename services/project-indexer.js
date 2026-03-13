import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerIntent } from '../core/decision-tree.js';
import { logDebug } from '../core/logger.js';

class ProjectIndexer {
    constructor() {
        this.projectsPath = path.join(os.homedir(), 'Documents', 'projects');
        this.projects = new Map();
        this.refreshInterval = 15 * 60 * 1000; // 15 minutes
    }

    async initialize() {
        logDebug('[DEBUG] ProjectIndexer: Initializing...');
        await this.refresh();

        // Setup background refresh
        setInterval(() => this.refresh(), this.refreshInterval);
    }

    async refresh() {
        if (!fs.existsSync(this.projectsPath)) {
            logDebug(`[DEBUG] ProjectIndexer: Path not found: ${this.projectsPath}`);
            return;
        }

        try {
            const dirs = fs.readdirSync(this.projectsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
                .map(dirent => dirent.name);

            console.log(`\x1b[36m🔍 ProjectIndexer: Scanning ${this.projectsPath}...\x1b[0m`);
            logDebug(`[DEBUG] ProjectIndexer: Found ${dirs.length} potential projects.`);

            for (const name of dirs) {
                const projectPath = path.join(this.projectsPath, name);
                const metadata = this.analyzeProject(projectPath, name);
                this.projects.set(name, metadata);

                console.log(`\x1b[32m📌 ProjectIndexer: Registering project "${name}" (${metadata.lang})\x1b[0m`);

                // Register name as a trigger for both KB and Terminal
                registerIntent('knowledge-base', {
                    triggers: [name],
                    context_hints: [metadata.lang || 'code', 'project']
                });

                registerIntent('terminal', {
                    triggers: [],
                    context_hints: [name, 'navigation', 'files']
                });
            }
        } catch (e) {
            logDebug(`[DEBUG] ProjectIndexer Error: ${e.message}`);
            console.error(`❌ ProjectIndexer Error: ${e.message}`);
        }
    }

    analyzeProject(projectPath, name) {
        try {
            const files = fs.readdirSync(projectPath);

            // Detect primary language
            let lang = 'unknown';
            if (files.includes('package.json')) lang = 'javascript';
            else if (files.includes('Package.swift')) lang = 'swift';
            else if (files.some(f => f.endsWith('.py') || f === 'requirements.txt')) lang = 'python';

            // Check for state / status
            let status = 'active';
            const geminiMd = path.join(projectPath, 'GEMINI.md');
            if (fs.existsSync(geminiMd)) {
                const content = fs.readFileSync(geminiMd, 'utf-8');
                if (content.toLowerCase().includes('on hold')) status = 'on-hold';
            }

            return {
                name,
                lang,
                status,
                fileCount: files.length
            };
        } catch (e) {
            return { name, lang: 'error', status: 'error', fileCount: 0 };
        }
    }

    getProjectNames() {
        return Array.from(this.projects.keys());
    }

    getProjectMetadata(name) {
        return this.projects.get(name);
    }
}

export const projectIndexer = new ProjectIndexer();
