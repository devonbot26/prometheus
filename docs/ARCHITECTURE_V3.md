# Prometheus Monolithic Architecture (v3.1)

This document outlines the stabilized **Monolithic Single-Model Architecture**, utilizing a 9B high-reasoning model (Qwopus 3.5) as the unified brain for all agentic tasks. 

## 1. Design Philosophy
The "True Monolith" architecture prioritizes **state consistency** and **reasoning depth** over raw model switching. Every task, from simple weather checks to complex code audits, is processed by the primary 9B model.

*   **Consistency**: Eliminates "context fragmentation" caused by switching between small and large models.
*   **Simplicity**: Reduces infrastructure overhead by running a single MLX server on Port 18888.
*   **Stability**: Prevents tool-loop hallucinations by maintaining a unified conversation history.

## 2. Component Layout

### Core Modules
*   **`core/agent.js`**: The primary orchestrator. Manages role-based identity (Architect, Coder, Manager) while sharing the same 9B brain.
*   **`core/llm.js`**: Unified connection library. Hardcoded to Port 18888 for predictable local execution.
*   **`core/loop-watchdog.js`**: Mid-stream repetition and hallucination detector. Ensures the 9B model doesn't enter "rambling" states during data-heavy generation.

### Execution Loop
1.  **Identity Mapping**: `Agent.process()` identifies the active mode/role and builds the appropriate system prompt.
2.  **Monolithic Generation**: Requests are sent to the 9B model on Port 18888.
3.  **Autonomous Recovery**: If the model stalls or loops, the `watchdog` triggers a graceful abort and re-prompts for a summary.

## 3. Infrastructure & RAM Management
*   **Single-Port Launcher**: `prom.js` and `start_llama.sh` manage one dedicated MLX server.
*   **VRAM Allocation**: The 9B model (4-bit quantized) is optimized for 16GB RAM M1/M2 systems, leaving a 4-6GB buffer for system operations and coding tools.

## 4. UI Integration
The **Prometheus Dashboard** acts as an observer of this monolithic state:
*   **Status Bar**: Displays the 9B model status (🖥️).
*   **Performance Metrics**: Real-time TPS and TTFT tracking for the unified engine.
*   **Mode Swapping**: Instant role-switching (e.g., Niki to Devon) without requiring server restarts.

---
*Last updated: 2026-04-05 (Consolidated Rollback v3.1)*
