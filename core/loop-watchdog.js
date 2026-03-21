/**
 * Prometheus Loop Watchdog
 * Detects repetitive patterns in LLM streams to prevent infinite thinking loops.
 */

export class StreamWatchdog {
    constructor(options = {}) {
        this.minPatternLength = options.minPatternLength || 40; // Characters
        this.maxWindowSize = options.maxWindowSize || 1000;    // Last N characters
        this.repetitionThreshold = options.repetitionThreshold || 3; // Occurrences
        this.stallTokenThreshold = options.stallTokenThreshold || 2000; // Tokens without action
        
        this.buffer = '';
        this.tokensSinceAction = 0;
        this.actionHistory = []; 
        this.maxActionHistory = 5;
    }

    /**
     * Feed a new chunk into the watchdog.
     * Returns true if a loop or stall is detected, false otherwise.
     */
    push(chunk) {
        this.buffer += chunk;
        this.tokensSinceAction += (chunk.trim().split(/\s+/).length); // Heuristic token count

        if (this.buffer.length > this.maxWindowSize) {
            this.buffer = this.buffer.slice(-this.maxWindowSize);
        }

        // L2 Detection: Stalling (Reasoning without tool call)
        if (this.tokensSinceAction > this.stallTokenThreshold) {
            console.warn(`🚨 [WATCHDOG] Stall detected! ${this.tokensSinceAction} tokens without action.`);
            return true;
        }

        // L1 Detection: Syntax Repetition
        if (this.buffer.length < this.minPatternLength * this.repetitionThreshold) {
            return false;
        }

        for (let len = this.minPatternLength; len < this.buffer.length / this.repetitionThreshold; len++) {
            const pattern = this.buffer.slice(-len);
            const prevSlice = this.buffer.slice(-len * 2, -len);
            const thirdSlice = this.buffer.slice(-len * 3, -len * 2);

            if (pattern === prevSlice && pattern === thirdSlice) {
                console.warn(`🚨 [WATCHDOG] Loop detected! Pattern: "${pattern.substring(0, 30)}..."`);
                return true;
            }
        }

        return false;
    }

    /**
     * Register a tool call to reset stalling and check for redundancy.
     * Returns true if redundant action loop detected.
     */
    registerAction(tool, args) {
        this.tokensSinceAction = 0; // Reset stall counter
        const actionHash = JSON.stringify({ tool, args });
        
        this.actionHistory.push(actionHash);
        if (this.actionHistory.length > this.maxActionHistory) {
            this.actionHistory.shift();
        }

        // L3 Detection: Redundancy (Same tool + args 3 times in a row)
        if (this.actionHistory.length >= 3) {
            const last = this.actionHistory[this.actionHistory.length - 1];
            const prev = this.actionHistory[this.actionHistory.length - 2];
            const third = this.actionHistory[this.actionHistory.length - 3];
            
            if (last === prev && last === third) {
                console.warn(`🚨 [WATCHDOG] Action redundancy detected: ${tool}`);
                return true;
            }
        }
        return false;
    }

    reset() {
        this.buffer = '';
        this.tokensSinceAction = 0;
        this.actionHistory = [];
    }
}
