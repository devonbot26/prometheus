This file tracks the autonomous progress and milestones of the Prometheus AI Assistant. See also: [[README]] | [[MANUAL]] | [[ROLES]]

### 2026-04-05 10:30:00 PM
- **System Recovery (v5.3.2)**: Implemented the **External Physician Protocol**.
    - **Total Independence**: Created a standalone recovery agent (`scripts/physician.mjs`) that does not import the Prometheus core, ensuring it can run during a total system crash.
    - **Native UI Integration**: Added a "Health" tab to the SwiftUI Dashboard with a **Manual WAKE UP** button.
    - **Atomic Surgery**: Implemented mandatory backups and `node --check` syntax audits for all Physician-led repairs.
    - **Hardware Authority**: Authorized the Physician to perform "Hard Hardware Resets" (Killing ports and re-launching MLX via `start_llama.sh`).

## Physician Recovery Lessons (v5.3.2)
- **Incident 2026-04-05-01**: Prometheus entered a "Syntax Loop" using invalid terminal parentheses `(ERR-010.json)`. 
    - **Diagnosis**: 9B model hallucinations in non-escaped shell commands caused a mid-stream abort.
    - **Fix**: Physician performed a baseline reset and cleared the stalled task state.
    - **Lesson**: High-priority tasks need explicit shell-escaping directives in the system prompt.
- **Incident 2026-04-05-02**: Physician returned an empty diagnosis.
    - **Diagnosis**: MLX server (Port 18888) was dead during the diagnostic turn.
    - **Fix**: Upgraded Physician to **v5.3.2** with explicit "Hardware Reset" reporting and fallback text.
    - **Lesson**: A "Silent Brain" must always be treated as a "Crashed Brain."

## System Stability: Lessons Learned (v4.1 Additions)

### 2026-04-05 08:45:00 PM
- **System Hardening (v4.1)**: Implemented **Hardened Persistence** for state safety.
    - **Deadlock Resolution**: Fixed the "Lethal Deadlock" where a failed background summarizer would leave the agent in a permanent "Busy" state. 
    - **Guaranteed Resets**: Wrapped all background history mutations in `try...finally` blocks to ensure the agent always returns to a ready/idle state.
    - **VRAM Safety (4k Limit)**: Reduced the truncation limit for 9B tool results from 12,000 to **4,000 characters**. This prevents context-overflow crashes on 16GB RAM machines during massive `curl` or `terminal_run` outputs.
    - **Hard Watchdogs**: Implemented a 5-minute hard timeout for all background summarization tasks to prevent infinite hangs.

## System Stability: Lessons Learned (v4.1 Additions)
- **The Sequential Lock Deadlock**: Implementing a sequential lock (`if (processing) return`) without a `finally` block for background tasks creates a "Silent Hang" risk. If the background task (summarizer) throws an error, the agent is locked in a "Busy" state forever.
    - *Fix*: Always use `finally` to reset the processing flag for any background task that holds a system lock.
- **Context-Overflow "Brownout"**: Large tool outputs (12k+ chars) on a 16k context window leave zero room for reasoning, causing the model to "stop" without a response or crash the MLX server.
    - *Fix*: Limit single-message tool outputs to 4,000 characters (1k tokens) to preserve reasoning bandwidth on memory-constrained hardware.
- **Background Error Masking**: Errors in `async` background closures are often swallowed, leading to "Silent Failures" that are hard to diagnose without explicit `console.error` blocks.


### 2026-04-05 06:45:00 PM
- **System Hardening (v4.0)**: Implemented **Fidelity Memory** for M1 Monolithic architecture.
    - **Hallucination Pruning**: Fixed the "Toronto Location" bug by increasing summarizer visibility from 150 to **2,048 characters**. 
    - **The 6-Message Safety Buffer**: Implemented a raw history buffer that protects the most recent 6 messages from compression, ensuring tool-loop continuity.
    - **Sequential Summarization**: Added an autonomous lock that prevents memory mutations while an agent is in an active reasoning/tool turn.
    - **Context Migration**: Implemented "Summary Migration" logic to ensure long-term historical context is never "sliced out" of the 16k context window.
    - **UI Stabilization**: Hardened the Native Dashboard by locking the Model Picker to the 9B monolithic baseline, preventing desync.

## System Stability: Lessons Learned (v4.0 Additions)
- **The Truncation Paradox**: Using a tiny substring (150 chars) for background summarization forces the model to "guess" missing details (like locations), leading to persistent hallucinations.
    - *Fix*: Baseline context visibility for summarization must be at least 2,048 characters on 16GB+ hardware.
- **Race Condition Amnesia**: Mutating history via background processes during a multi-turn tool loop causes the model to "forget" its last result, triggering redundant re-execution.
    - *Fix*: Implement an `if (this.processing) return;` guard on all memory-mutating background jobs.
- **Double-Pruning Errors**: Slicing history based on token count can accidentally remove the "Historical Summary" message itself.
    - *Fix*: Context preparation logic must explicitly search for and re-inject the Summary Message if it is missing from the active slice.


### 2026-04-01 11:30:00 AM
- **Major Architecture Shift**: Implemented the **Prioritized Model Controller (Scheduler)**.
    - **Zero-Jitter Hardware Access**: Replaced the filesystem "Spin-Lock" with an event-driven FIFO queue. Reduced polling latency from 1000ms to 100ms.
    - **Priority Scheduling**: Enforced a strict priority matrix where interactive user turns (Niki/Devon) jump to the front of the queue, pre-empting background tasks.
    - **Context Healing**: Resolved "Induced Amnesia" by removing destructive history wipes on autonomous handoffs. History now persists across 50+ turns using a sliding window.
    - **Expanded Memory**: Increased history truncation limits from 1,500 to **12,000 characters** for 9B models, enabling reliable long-file analysis.
    - **Refactored Summarizer**: Moved history compression into a core class method that respects the scheduler's queue, preventing background interference during reasoning.


### 2026-03-31 05:50:00 AM
- **Optimization Breakthrough**: Implemented **4-bit KV Cache Quantization** (TurboQuant) for local MLX models.
    - **Long-Context Stability**: Successfully validated 128,000 token context on Qwen-9B, which previously crashed at 48k.
    - **Memory Scalability**: Achieved ~60% theoretical memory savings for the KV cache, enabling reliable multi-agent orchestration on 16GB-32GB hardware.
    - **Performance**: Confirmed sub-30s prefill (TTFT) for 128k context on 9B models with near-zero accuracy degradation.
    - **Infrastructure**: Patched `mlx_lm.server` and updated `start_llama.sh`. **Enabled 4-bit KV quantization by default** via `prometheus.env`.

### 2026-03-14 16:25:00 PM
- **Native UI Evolution**: Stabilized the standalone macOS PrometheusDashboard.
    - **Focus Resolution**: Solved the "terminal steals keyboard" bug by enforcing `.regular` activation policy and explicit `NSWindow` key/main states.
    - **Protocol Maturity**: Fixed Socket.io native handshake (Engine.io EIO=4) and added support for `agent_output` and `agent_response` events.
    - **Aesthetic**: Standardized high-density 11pt font across all views and restored fluid window resizability.

### 2026-03-05 12:40:00 PM
- **Streaming & UX Evolution**: Matches OpenCode aesthetic and performance.
    - **Performance**: Implemented real-time NDJSON streaming for local MLX models. Achieved ~14.8 tok/s and near-zero TTFT.
    - **Aesthetic**: Refactored CLI UI with vertical borders (`┃`), dimmed reasoning blocks, and structured metadata footers.
    - **Efficiency**: Muted verbose autonomous tool logs; background iterations now show as subtle single-line indicators.
- **Safety Architecture**: Implemented a "Mid-Stream Watchdog" repeating guard. If a model starts looping on a sentence (3+ repetitions), the assistant now aborts the request mid-token to prevent runaway CPU usage.
- **Cognitive Guardrails**: Added "Goal-Oriented Pruning" for small models (4B). Greetings now trigger aggressive history clearing to prevent fixation on stale instructions.
- **State Management**: Added `reset_team_state` tool and auto-housekeeping logic that clears plans/tasks older than 24 hours.
- **Self-Improvement Evolution**: Implemented "Professional Self-Coder Loop".
    - **Rollback Mechanism**: Integrated Git-based `checkpoint` and `rollback_patch`. Devon now saves file state before patching and can auto-revert if things break.
    - **Automated Verification**: Added `verify_syntax` (node --check) and `run_quick_test`. No patch is committed unless it passes a syntax audit.


### 2026-03-03 20:30:00 PM
- **System Integrity**: Executed a full maintenance audit using [[health_check.js]]. 
- **Verification**: 17/17 skills, 8 modes, and 2 model mappings confirmed as healthy.
- **Diagnostic Tool**: Established a permanent health check script in `scripts/health_check.js` for future proactive monitoring.
- **Standards Adherence**: All audit artifacts generated using the Obsidian [[Assistant_Precision_Improvement_Plan.md]] protocol.

### 2026-02-24 13:05:00 PM
- **Model Evolution**: Migrated entire ecosystem (Antigravity, OpenCode, Prometheus) to **Qwen2.5-7B**. Deprecated `Nanbeige` due to persistent instruction-following failures and hallucinatory `<think>` blocks.

### 2026-02-23 10:12:00 AM
- **Mandatory Protocol**: **Verification & Audit**. All future development, coding, configuration updates, and bug fixes MUST be tested and audited before being confirmed to the user. A "fix" is not a fix until it is verified through direct tool execution or manual audit in the live system.

### 2026-02-23 09:35:00 AM
- **Optimization**: Switched the core model to Nanbeige 4.1-3B-8bit to resolve memory exhaustion issues.
- **Fine-tuning**: Initiated a fresh LoRA fine-tuning run for Nanbeige 3B (100 iters).
- **New Protocol**: **Adapter Management**. When training a model, always use a specific name for the adapter path that includes the model name (e.g., `adapters/nanbeige-3b`). Never leave multiple incompatible adapters in a generic `adapters/` root to prevent dimension mismatch crashes.
### 2026-02-27 10:15:00 AM
- **Methodology**: Implemented **GSD-inspired Improvements**.
    - **Crash Recovery**: Added `STATE.md` live execution tracking in `agent.js`. Prometheus now detects and reports interrupted sessions on startup.
    - **Auditability**: Implemented **Auto Git-Commit** in `self-coder`. Every self-modified file is now automatically committed to the repository for perfect traceability.
    - **Reliability**: Enforced **Mandatory Verification** in `apply_patch`. The system now re-reads and confirms every code change before reporting success.

### 2026-02-23 11:58:00 AM
- **Milestone**: Confirmed Gmail API passphrase is "Prometheus". Updated system identity to reflect this shard secret.
- **2026-02-23**: Fixed Gmail Auth (ERR-016), implemented `system_repair_gmail`, and optimized memory/shutdown stability.

## System Stability: Lessons Learned
- **Prompt Pressure**: For 3B models (like Nanbeige), prompt context over 3000 chars triggers reasoning/hallucination loops on low RAM.
- **Low-Memory Mode**: Implemented a <500MB RAM guard in `agent.js` that slashes context to 1500 chars, boosting speed from 3 to 12 tok/s.
- **Cleanup**: Port-based killing (`lsof`) is required because swapped-out processes sometimes ignore SIGTERM.
- **Memory Pressure & LLM Reliability**: 16GB RAM constraints (high compression/swap) caused output truncation (invalid JSON) in 3B models.
  - *Fix*: Streamlined system prompt and implemented aggressive history pruning (truncating tool results >2000 chars).
- **State Paradoxes**: Stale `HANDOFF.json` entries from previous turns can conflict with new project plans in `PM_STATE.json`.
  - *Fix*: Integrated state synchronization manually and added "Project Plan" visibility to the Context Hub UI.
- **Silent Idle (Core Bug)**: A "Hardened" loop in `core/agent.js` forced the agent into an autonomous history-wipe state after every tool call.
  - *Fix*: Removed forced autonomy to restore conversational continuity and history persistence.
- **Optimization Cold Starts**: High-performance local models (MXFP4) can have a 90s+ cold start on the first run, triggering watchdog timeouts.
  - *Fix*: Increased watchdog limits and health checks to 90s to accommodate Apple Silicon native JIT compilation for new formats.
- **The VRAM Paradox (Web UI vs. LLM)**: Running a browser UI (800MB+) alongside a local LLM creates a memory bottleneck that slashes token generation speed.
  - *Fix*: Transitioned core UI to **Native SwiftUI + Unix Domain Sockets** to reclaim ~90% of UI RAM overhead and ensure zero network-port exposure.
- **Keyboard Focus & CLI Activation**: On macOS, apps launched via `swift run` are often treated as background processes, causing keystrokes to stay in the terminal.
  - *Fix*: Explicitly set `NSApp.setActivationPolicy(.regular)` and use `makeKeyAndOrderFront` to force focus capture.
- **Socket.io Native Handshake**: Native implementations must explicitly send the `40` (Connect) packet immediately after the `5` (Upgrade) packet to enable custom event routing.
- **Swift 6 Actor Isolation in Bridges**: Large-scale asynchronous bridges with recursive polling (like WebSocket receive loops) trigger actor isolation warnings.
  - *Fix*: Wrap recursive calls in `Task { @MainActor in ... }` to preserve thread safety without blocking the ingestion loop.

### Architectural Decision Tree
- **Native (SwiftUI/Unix IPC)**: Default for primary workstation usage (Apple Silicon). Maximizes RAM for models.
- **Headless (API)**: Default for server-side or secondary mac deployments.
- **Web (Dashboard)**: Deprecated for core local control; reserved for authenticated remote multi-device monitoring.
- **Future Improvements**:
  - Implement a proactive state scrubber that clears stale handoff/timer files when a new plan is saved.
  - Implement a "Sanity Checker" that verifies tool-call outputs against the current reasoning (<think>) block.
  - Enhance the manual recovery scripts to handle "Logic Paradox" detection automatically.

### 2026-03-01 1:08:45 AM
- **Summary**: Executed a research plan for the top 10 new/trending projects on GitHub, initialized a note, gathered data from web search, and appended summaries for each project.

### 2026-04-02 10:19:25 PM
- **Summary**: Recorded a lesson learned about Python AST analysis into long-term memory. The observation includes key concepts: python, ast-analysis, static-analysis, and code-inspection.
