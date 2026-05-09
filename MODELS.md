# Prometheus Model Architecture (v5.4.2 - Dynamic SME Synthesis)

This document outlines the **Fidelity Memory Monolith v5.4.2**, optimized for **Apple Silicon (M1/M2/M3)**.

## 🖥️ Primary Model: Qwopus 3.5 9B (Monolith)
The system now runs exclusively on a unified **9B reasoning engine** on Port 18888. This eliminates "Worker/Reasoner" desync and ensures deep intelligence for all tasks.

### Key Specifications:
*   **Model ID**: `Jackrong/MLX-Qwopus3.5-9B-v3-4bit` (Monolithic Baseline)
*   **Context Safety Budget**: **16,384 tokens** (M1 Unified Memory limit)
*   **Standard Port**: 18888 (Reasoning & Utility)

---

## 🎨 Synthesis Model Routing (v5.4.2)
To support **Dynamic SME Synthesis**, the orchestrator now employs a fallback routing system for transient roles:

1.  **Identity Resolution**: If a role is not found in the static `prompts/` directory, the agent scans `prompts/dynamic/`.
2.  **Config Inheritance**: Dynamic roles (e.g., `team-cobol-expert`) automatically inherit the **team-coder** configuration (9B Tier, 16k tokens) to ensure maximum technical fidelity for specialized tasks.
3.  **Tool Template Injection**: The orchestrator parses `<!-- tool_template: ... -->` markers from the synthesized persona to force-inject specialized skillsets (Terminal, Web Search, etc.) without manual tool registration.

---

## 🧠 Fidelity Memory Architecture (v4.0 Updates)
To prevent "hallucinations" and "redundant execution", the following memory harness is enforced:

### 1. High-Fidelity Sight (2,048 Characters)
Increased visibility to **2,048 characters** ensures the model captures the *entire* user intent before summarizing.

### 2. The 6-Message Safety Buffer
The most recent **6 messages** are kept in "High-Definition" raw history, un-compressed for perfect clarity.

### 3. Sequential Summarization Lock
The summarizer only triggers in the **Idle Phase**, preventing memory mutations during active tools.

### 4. Summary Migration
Historical Context is automatically **migrated** forward into the active 16k window for long-running projects.

---

## 🚦 System Guardrails
*   **WATCHDOG_ABORT**: Repetitive tool output is killed after 5 iterations, breaking infinite loops.
*   **Self-Healing**: Timeout errors trigger diagnostics but are guarded against recursive "Abort-Loops."
*   **SME Depth Cap**: Transient specialists are forbidden from recursive agent spawning.

---
*Last Updated: April 2026 (v5.4.2 Dynamic SME Synthesis Milestone)*
