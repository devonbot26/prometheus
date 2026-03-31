# Prometheus Project Timeline

This file tracks the autonomous progress and milestones of the Prometheus AI Assistant. See also: [[README]] | [[MANUAL]] | [[ROLES]]

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
