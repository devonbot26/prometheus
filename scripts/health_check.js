/**
 * Prometheus Health Check
 * Automates verification of all skills, environment variables, and LLM connectivity.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    dim: "\x1b[2m"
};

async function runHealthCheck() {
    console.log(`\n${COLORS.bright}🚑 Prometheus System Health Check${COLORS.reset}\n`);
    console.log(`${COLORS.dim}Date: ${new Date().toLocaleString()}${COLORS.reset}\n`);

    // 1. Environment Audit
    console.log(`${COLORS.bright}[1/3] Environment Audit${COLORS.reset}`);
    const requiredEnv = ['LLM_MODEL', 'LLM_PORT'];
    let envPass = true;
    for (const key of requiredEnv) {
        if (!process.env[key]) {
            console.log(`  ${COLORS.red}✗${COLORS.reset} Missing ${key}`);
            envPass = false;
        } else {
            console.log(`  ${COLORS.green}✓${COLORS.reset} ${key}: ${process.env[key]}`);
        }
    }

    // 2. LLM Connectivity
    console.log(`\n${COLORS.bright}[2/3] LLM Connectivity${COLORS.reset}`);
    const port = process.env.LLM_PORT || 18888;
    const url = `http://127.0.0.1:${port}/health`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            console.log(`  ${COLORS.green}✓${COLORS.reset} Local server reachable on port ${port}`);
        } else {
            throw new Error(`Server returned ${res.status}`);
        }
    } catch (e) {
        console.log(`  ${COLORS.yellow}⚠${COLORS.reset} Local server not responding (${e.message})`);
        console.log(`    ${COLORS.dim}(Make sure 'npm run start:llama' is running)${COLORS.reset}`);
    }

    // 3. Skill & Tool Audit
    console.log(`\n${COLORS.bright}[3/3] Skill & Tool Audit${COLORS.reset}`);
    const skillsDir = path.join(ROOT, 'skills');
    const skills = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory() && !f.startsWith('_'));

    console.log(`  ${COLORS.dim}Found ${skills.length} skills in /skills${COLORS.reset}\n`);

    let totalTools = 0;
    let failedSkills = 0;

    console.log(`  ${'Skill'.padEnd(20)} | ${'Status'.padEnd(8)} | ${'Tools'}`);
    console.log(`  ${'─'.repeat(20)}─┼─${'─'.repeat(8)}─┼─${'─'.repeat(10)}`);

    for (const skill of skills) {
        const skillPath = path.join(skillsDir, skill);
        const configPath = path.join(skillPath, 'skill.json');

        let status = `${COLORS.green}PASS${COLORS.reset}`;
        let toolCount = 0;
        let errors = [];

        try {
            if (!fs.existsSync(configPath)) {
                throw new Error("Missing skill.json");
            }

            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const tools = config.tools || {};
            toolCount = Object.keys(tools).length;
            totalTools += toolCount;

            for (const [id, tool] of Object.entries(tools)) {
                const bridgePath = path.join(skillPath, tool.path);
                if (!fs.existsSync(bridgePath)) {
                    errors.push(`Tool '${id}' missing bridge: ${tool.path}`);
                }
            }

        } catch (e) {
            status = `${COLORS.red}FAIL${COLORS.reset}`;
            errors.push(e.message);
            failedSkills++;
        }

        console.log(`  ${skill.padEnd(20)} | ${status.padEnd(17)} | ${toolCount}`);
        if (errors.length > 0) {
            errors.forEach(err => console.log(`    ${COLORS.red}└─ Error: ${err}${COLORS.reset}`));
        }
    }

    console.log(`\n${COLORS.bright}Final Verdict:${COLORS.reset}`);
    if (failedSkills === 0 && envPass) {
        console.log(`  ${COLORS.green}✨ ALL SYSTEMS GO. Prometheus is 100% operational.${COLORS.reset}`);
    } else {
        console.log(`  ${COLORS.red}🛑 ${failedSkills} skills failed the health check.${COLORS.reset}`);
    }
    console.log(`  ${COLORS.dim}Total Tools Analyzed: ${totalTools}${COLORS.reset}\n`);
}

runHealthCheck();
