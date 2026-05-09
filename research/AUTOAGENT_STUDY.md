# Research Study: HKUDS/AutoAgent & Prometheus Synergy

This document captures the core concepts of the **HKUDS/AutoAgent** research for potential future implementation in a "Multi-Brain" Prometheus architecture.

---

## 🔬 Core AutoAgent Concepts (HKUDS/University of Hong Kong)

1.  **Actionable Engine (Generative Workflows)**
    *   **Concept**: Uses an LLM to dynamically construct the entire agent architecture, tools, and logical loops from a natural language request.
    *   **Advantage**: Extreme flexibility; No manual coding for niche tasks.
    *   **Synergy**: Could replace the current template-based `synthesize_expert` in Prometheus with a generative version when model reasoning allows.

2.  **Self-Managing File System (Automated RAG)**
    *   **Concept**: Intelligent ingestion of diverse file formats into a searchable "Self-Play" knowledge base.
    *   **Synergy**: Enhances the existing `memory-manager.js` and `project-indexer.js` with autonomous data structuring.

3.  **Self-Play Agent Customization (Optimization)**
    *   **Concept**: Agents "practice" tasks internally through self-play (simulation) to optimize their own system prompts and tool-selection logic.
    *   **Synergy**: Future Prometheus roles could "pre-train" their identity prompts in the background before execution.

---

## ⚖️ Comparison: Prometheus (v5.4.x Monolith) vs. AutoAgent

| Metric | Prometheus (Current) | AutoAgent (Concept) |
| :--- | :--- | :--- |
| **Logic Root** | **Monolithic Single-Model**: One 9B brain "wears hats." | **Generative Multi-Agent**: Many brains, many roles. |
| **Synthesis** | **Template-Based**: Expert SMEs filled into pre-built shells. | **Architectural**: Entire agent logic created de novo. |
| **State Consistency** | **Maximum**: Shared history, shared brain. | **Distributed**: Requires complex context handover. |
| **Hardware** | **Efficiency-First**: Optimized for 16GB-32GB Mac (MLX). | **Compute-Heavy**: Better suited for 64GB+ or Cloud. |

---

## 🚀 Potential Roadmap: "Prometheus Multi-Brain"

When hardware (e.g., Mac Studio / M4 Ultra) permits running multiple local models simultaneously:

1.  **Distributed SME Nodes**: Instead of Niki switching her own identity, she would spawn a separate 4B model (Worker) while keeping the 9B model (Manager) active.
2.  **Generative Identity**: Moving away from the `skills/team-manager/prompts/` templates to a truly generative identity file built on-the-fly (`prompts/dynamic/*.md`).
3.  **Cross-Model Validation**: Using a 14B or 32B "Critic" model to audit the outputs of smaller synthesized workers (Automated QA).

---
*Note: This study is for future reference only. Current development remains focused on the **Monolithic Stability v5.4.2** architecture.*
