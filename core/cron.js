import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { logDebug } from './logger.js';
import { memoryManager } from './memory-manager.js';

/**
 * Initializes all background Cron Jobs for Prometheus
 * @param {Agent} agent - The main agent instance to inject prompts into
 * @param {Function} printFn - Callback strictly to print output to the active channel
 */
export function initCronJobs(agent, printFn) {
    console.log('⏳ [CRON] Background jobs disabled for live test.');
}

async function runMemorySummarizer(agent, printFn, retries = 0) {
    // Disabled
}

async function checkBootRecovery(agent, printFn) {
    // Disabled
}
