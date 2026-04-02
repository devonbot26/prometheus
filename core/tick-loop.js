import os from 'os';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logDebug } from './logger.js';

/**
 * Prometheus Tick Loop Orchestrator
 * Centralizes all background/autonomous tasks (Email, Indexing, Reflection).
 * Handles Daytime/Nighttime priority and RAM-aware scheduling.
 */
export class TickLoop {
    constructor(agent, io, services = {}) {
        this.agent = agent;
        this.io = io;
        this.services = services; // { email: EmailWatcher, reflection: SelfReflection, indexer: ProjectIndexer }
        
        this.tickInterval = 60000; // Check every 1 minute
        this.idleThreshold = 15 * 60 * 1000; // 15 minutes of inactivity for daytime ticks
        this.ramLimitMB = 2048; // Skip tasks if RAM < 2GB
        
        this.timer = null;
        this.isTicking = false;
        
        this.lastEmailPoll = 0;
        this.emailInterval = 3600000; // 1 hour for email polling (Daytime)
        this.nightEmailInterval = 900000; // 15 mins for email polling (Nighttime)
    }

    start() {
        console.log('💓 [TICK LOOP] Orchestrator started.');
        this.timer = setInterval(() => this.tick(), this.tickInterval);
        // Initial tick after 10s
        setTimeout(() => this.tick(), 10000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.isTicking = false;
    }

    getFreeMemMB() {
        try {
            if (os.platform() === 'darwin') {
                const output = execSync('vm_stat').toString();
                const pageSize = 16384; 
                const free = parseInt(output.match(/Pages free:\s+(\d+)/)?.[1] || 0);
                const inactive = parseInt(output.match(/Pages inactive:\s+(\d+)/)?.[1] || 0);
                const speculative = parseInt(output.match(/Pages speculative:\s+(\d+)/)?.[1] || 0);
                const purgeable = parseInt(output.match(/Pages purgeable:\s+(\d+)/)?.[1] || 0);
                return Math.floor(((free + inactive + speculative + purgeable) * pageSize) / (1024 * 1024));
            }
            return Math.floor(os.freemem() / (1024 * 1024));
        } catch (e) {
            return Math.floor(os.freemem() / (1024 * 1024));
        }
    }

    async tick() {
        if (this.isTicking || this.agent.processing) return;

        const now = Date.now();
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour >= 23;
        const idleTime = now - (this.agent.lastActivityAt || now);
        
        // 1. Condition Check
        if (!isNight && idleTime < this.idleThreshold) {
            // daytime and not idle enough, skip
            return;
        }

        const freeMem = this.getFreeMemMB();
        if (freeMem < this.ramLimitMB) {
            console.warn(`🛑 [TICK LOOP] RAM Pressure too high (${freeMem}MB Free). Skipping autonomous turn.`);
            this.io.emit('log', `⚠️ RAM Pressure Warning: ${freeMem}MB. Background tasks skipped.`);
            return;
        }

        console.log(`💓 [TICK LOOP] Running autonomous turn... (Mode: ${isNight ? 'NIGHT' : 'DAY_IDLE'})`);
        this.isTicking = true;

        try {
            // 2. Sequential Job Queue
            
            // TASK A: Email Checker (Hourly in day, Priority at night)
            const currentEmailInterval = isNight ? this.nightEmailInterval : this.emailInterval;
            if (now - this.lastEmailPoll >= currentEmailInterval) {
                if (this.services.email && this.services.email.poll) {
                    console.log('📧 [TICK] Running Email Poll...');
                    await this.services.email.poll();
                    this.lastEmailPoll = now;
                }
            }

            // TASK B: Project Indexer (Once per hour or on night priority)
            const lastIndex = this.services.indexer?.lastRefresh || 0;
            if (isNight || (now - lastIndex > 3600000)) {
                if (this.services.indexer && this.services.indexer.refresh) {
                    console.log('📂 [TICK] Refreshing Project Index...');
                    await this.services.indexer.refresh();
                }
            }

            // TASK C: Night-time Only - AutoDream / Memory Consolidation
            if (hour === 3 && !this.dailyRecapRun) {
                console.log('🌙 [TICK] Running 3 AM Daily Recap (AutoDream)...');
                await this.runDailyRecap();
                this.dailyRecapRun = true;
            } else if (hour !== 3) {
                this.dailyRecapRun = false;
            }

            // TASK D: Reflection (Audit)
            if (isNight || (now - (this.lastReflection || 0) > 43200000)) { // 12h
                if (this.services.reflection && this.services.reflection.reflect) {
                    console.log('🤖 [TICK] Running Self-Reflection Audit...');
                    await this.services.reflection.reflect();
                    this.lastReflection = now;
                }
            }

        } catch (e) {
            console.error('❌ [TICK LOOP] Task Failure:', e.message);
        } finally {
            this.isTicking = false;
        }
    }

    async runDailyRecap() {
        if (!this.services.reflection || !this.services.reflection.checkMorningBriefing) return;
        await this.services.reflection.checkMorningBriefing();
    }
}
