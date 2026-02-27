# Prometheus Project Timeline

This file tracks the autonomous progress and milestones of the Prometheus AI Assistant. See also: [[README]] | [[MANUAL]]

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
- **Future Improvements**:
  - Implement a proactive memory watchdog that suggests RAM cleanup.
  - Move to process group management (`process.kill(-pid)`) for all background tasks.
  - Implement a "Low Memory Mode" for the agent to bypass complex history when RAM is <200MB free.
