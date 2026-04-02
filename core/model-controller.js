import { EventEmitter } from 'events';
import { withLock } from './llm_lock.js';

/**
 * ModelController (Singleton)
 * Orchestrates all LLM requests to the local hardware.
 * Uses a prioritized FIFO queue to ensure Interactive turns pre-empt Background tasks.
 */
class ModelController extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.activeTask = null;
        this.isProcessing = false;
        
        // Priority Definitions
        this.PRIORITY = {
            CRITICAL: 0,
            HIGH: 1,      // Interactive (User)
            MEDIUM: 2,
            LOW: 3        // Background (Summarizer, Audits)
        };
    }

    /**
     * Enqueue a new LLM task
     * @param {string} owner Task name for logs
     * @param {Function} taskFn Async function returning a chat response
     * @param {Object} options priority, metadata
     */
    async enqueue(owner, taskFn, options = {}) {
        const priority = options.priority !== undefined ? options.priority : this.PRIORITY.HIGH;
        const id = `task_${Math.random().toString(36).substring(7)}`;
        
        return new Promise((resolve, reject) => {
            const task = {
                id,
                owner,
                taskFn,
                priority,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queue.push(task);
            this.sortQueue();
            
            console.log(`📥 [SCHEDULER] Job Enqueued: ${owner} (Pri: ${priority}, Queue: ${this.queue.length})`);
            this.processQueue();
        });
    }

    /**
     * Sort queue by priority (lower number = higher priority) and then by timestamp
     */
    sortQueue() {
        this.queue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.timestamp - b.timestamp;
        });
    }

    /**
     * Process the next task in the queue
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const task = this.queue.shift();
        this.activeTask = task;

        console.log(`🚀 [SCHEDULER] Executing: ${task.owner} (${task.id})`);

        try {
            // We still use withLock for cross-process safety (shared with logs/llm.lock)
            // But now it's only called once per queue turn, preventing "lock racing"
            const result = await withLock(task.owner, async () => {
                return await task.taskFn();
            });
            task.resolve(result);
        } catch (e) {
            console.error(`🚨 [SCHEDULER] Task Failed: ${task.owner}`, e.message);
            task.reject(e);
        } finally {
            console.log(`🏁 [SCHEDULER] Completed: ${task.owner}`);
            this.activeTask = null;
            this.isProcessing = false;
            
            // Immediately trigger next job
            setImmediate(() => this.processQueue());
        }
    }

    /**
     * Get the status of the queue for the Dashboard
     */
    getDashboardStatus() {
        return {
            isProcessing: this.isProcessing,
            activeJob: this.activeTask ? this.activeTask.owner : 'IDLE',
            pendingCount: this.queue.length,
            queuePreview: this.queue.map(t => ({ owner: t.owner, pri: t.pri }))
        };
    }
}

export const modelController = new ModelController();
export const PRIORITY = modelController.PRIORITY;
